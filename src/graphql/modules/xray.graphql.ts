import { GraphQLError } from "graphql";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
import {
  xraysRepository,
  XrayBoardError,
  type SaveXrayBoardObject,
} from "../../modules/xrays/xrays.repository";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";
import { z } from "zod";
import {
  XRAY_BOARD_MAX_OBJECTS,
  XRAY_NOTE_FONT_SIZE,
  XRAY_SLOT_CODE_PATTERN,
} from "../../modules/xrays/xrays.contract";

const saveXrayObjectSchema = z
  .object({
    objectType: z.enum(["image", "note"]),
    zIndex: z.number().int(),
    posX: z.number().int(),
    posY: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rotation: z.number().min(0).lt(360).default(0),
    assetId: z.string().uuid().nullable().optional(),
    slotCode: z
      .string()
      .regex(XRAY_SLOT_CODE_PATTERN, "Unknown X-ray slot code")
      .nullable()
      .optional(),
    noteText: z.string().nullable().optional(),
    noteColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "noteColor must be #RRGGBB")
      .nullable()
      .optional(),
    noteFontSize: z
      .number()
      .int()
      .min(XRAY_NOTE_FONT_SIZE.min)
      .max(XRAY_NOTE_FONT_SIZE.max)
      .nullable()
      .optional(),
  })
  .superRefine((object, context) => {
    if (object.objectType === "image" && !object.assetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetId"],
        message: "Image objects require assetId",
      });
    }
    if (object.objectType === "note" && object.assetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assetId"],
        message: "Note objects cannot reference an asset",
      });
    }
    if (object.objectType === "note" && object.slotCode) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slotCode"],
        message: "Note objects cannot occupy an X-ray slot",
      });
    }
  });

const saveXrayBoardSchema = z
  .object({
    visitId: z.string().uuid(),
    objects: z.array(saveXrayObjectSchema).max(XRAY_BOARD_MAX_OBJECTS),
  })
  .superRefine(({ objects }, context) => {
    const seenAssetIds = new Set<string>();
    const seenSlotCodes = new Set<string>();

    for (const [index, object] of objects.entries()) {
      if (object.assetId) {
        if (seenAssetIds.has(object.assetId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["objects", index, "assetId"],
            message: "An X-ray asset can appear only once on a board",
          });
        }
        seenAssetIds.add(object.assetId);
      }

      if (object.slotCode) {
        if (seenSlotCodes.has(object.slotCode)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["objects", index, "slotCode"],
            message: "An X-ray slot can contain only one image",
          });
        }
        seenSlotCodes.add(object.slotCode);
      }
    }
  });

type XrayAssetRecord = Awaited<ReturnType<typeof xraysRepository.findAssetsByVisitId>>[number];

export const toXrayAssets = async (assets: XrayAssetRecord[]) => {
  assets = assets.filter((asset) => asset.status !== "cleanup_failed");
  if (assets.length === 0) return [];

  const { data: signedUrls, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_XRAY_BUCKET)
    .createSignedUrls(
      assets.map((asset) => asset.storage_path),
      env.SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN
    );

  if (error) throw error;

  const signedUrlByPath = new Map(
    signedUrls.map((signedUrl) => [signedUrl.path, signedUrl.signedUrl])
  );
  const urlExpiresAt = new Date(
    Date.now() + env.SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN * 1000
  ).toISOString();

  return assets.flatMap((asset) => {
    const signedUrl = signedUrlByPath.get(asset.storage_path);
    return signedUrl
      ? [
          {
            id: asset.asset_id,
            fileName: asset.file_name,
            mimeType: asset.mime_type,
            fileSize: asset.file_size,
            naturalWidth: asset.natural_width,
            naturalHeight: asset.natural_height,
            status: asset.status,
            signedUrl,
            urlExpiresAt,
          },
        ]
      : [];
  });
};

export const cleanupOrphans = async (visitId: string) => {
  const orphans = await xraysRepository.findOrphanedAssets(visitId);

  for (const orphan of orphans) {
    try {
      const { error } = await supabaseAdmin.storage
        .from(env.SUPABASE_XRAY_BUCKET)
        .remove([orphan.storage_path]);

      if (error) throw error;
      await xraysRepository.deleteAsset(orphan.asset_id);
    } catch (error) {
      try {
        await xraysRepository.markCleanupFailed(orphan.asset_id);
      } catch (markError) {
        console.error("Failed to mark X-ray cleanup failure", {
          assetId: orphan.asset_id,
          message: markError instanceof Error ? markError.message : String(markError),
        });
      }

      console.warn("X-ray orphan cleanup failed", {
        assetId: orphan.asset_id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

const toXrayBoard = async (
  board: NonNullable<Awaited<ReturnType<typeof xraysRepository.findBoardByVisitId>>>,
  assets: XrayAssetRecord[]
) => ({
  id: board.board_id,
  visitId: board.visit_id,
  status: board.status,
  savedAt: board.saved_at?.toISOString() ?? null,
  objects: board.objects.map((object) => ({
    id: object.object_id,
    objectType: object.object_type,
    zIndex: object.z_index,
    posX: object.pos_x,
    posY: object.pos_y,
    width: object.width,
    height: object.height,
    rotation: Number(object.rotation),
    assetId: object.asset_id,
    slotCode: object.slot_code,
    noteText: object.note_text,
    noteColor: object.note_color,
    noteFontSize: object.note_font_size,
  })),
  assets: await toXrayAssets(assets),
});

export const xrayTypeDefs = /* GraphQL */ `
  enum XrayObjectType {
    image
    note
  }

  enum XrayBoardStatus {
    draft
    saved
  }

  enum XrayAssetStatus {
    pending
    active
    orphaned
    cleanup_failed
  }

  type XrayAsset {
    id: ID!
    fileName: String!
    mimeType: String!
    fileSize: Int!
    naturalWidth: Int!
    naturalHeight: Int!
    status: XrayAssetStatus!
    signedUrl: String!
    urlExpiresAt: String!
  }

  type XrayBoardObject {
    id: ID!
    objectType: XrayObjectType!
    zIndex: Int!
    posX: Int!
    posY: Int!
    width: Int!
    height: Int!
    rotation: Float!
    assetId: ID
    slotCode: String
    noteText: String
    noteColor: String
    noteFontSize: Int
  }

  type XrayBoard {
    id: ID!
    visitId: ID!
    status: XrayBoardStatus!
    savedAt: String
    objects: [XrayBoardObject!]!
    assets: [XrayAsset!]!
  }

  input XrayBoardObjectInput {
    objectType: XrayObjectType!
    zIndex: Int!
    posX: Int!
    posY: Int!
    width: Int!
    height: Int!
    rotation: Float
    assetId: ID
    slotCode: String
    noteText: String
    noteColor: String
    noteFontSize: Int
  }

  input SaveXrayBoardInput {
    visitId: ID!
    objects: [XrayBoardObjectInput!]!
  }

  extend type Query {
    xrayBoardByVisit(visitId: ID!): XrayBoard
    refreshXrayUrls(assetIds: [ID!]!): [XrayAsset!]!
  }

  extend type Mutation {
    saveXrayBoard(input: SaveXrayBoardInput!): XrayBoard!
  }
`;

export const xrayResolvers = {
  Query: {
    xrayBoardByVisit: async (
      _parent: unknown,
      { visitId }: { visitId: string },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const visit = await xraysRepository.findOwnedVisit(visitId, userId);
      if (!visit) {
        throw new GraphQLError("Visit not found", {
          extensions: { code: "NOT_FOUND" },
        });
      }

      const board = await xraysRepository.findBoardByVisitId(visitId);
      if (!board) return null;

      const assets = await xraysRepository.findAssetsByVisitId(visitId);
      return toXrayBoard(board, assets);
    },

    refreshXrayUrls: async (
      _parent: unknown,
      { assetIds }: { assetIds: string[] },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const assets = await xraysRepository.findAssetsByIds(assetIds);
      const visitIds = [...new Set(assets.map((asset) => asset.visit_id))];
      const ownedVisitIds = new Set(
        (
          await Promise.all(
            visitIds.map((visitId) =>
              xraysRepository.findOwnedVisit(visitId, userId)
            )
          )
        )
          .filter((visit): visit is NonNullable<typeof visit> => Boolean(visit))
          .map((visit) => visit.visit_id)
      );

      return toXrayAssets(
        assets.filter((asset) => ownedVisitIds.has(asset.visit_id))
      );
    },
  },

  Mutation: {
    saveXrayBoard: async (
      _parent: unknown,
      { input }: { input: unknown },
      context: GraphQLContext
    ) => {
      const { userId } = requireAuth(context);
      const parsed = saveXrayBoardSchema.safeParse(input);
      if (!parsed.success) {
        throw new GraphQLError("Invalid X-ray board input", {
          extensions: {
            code: "BAD_USER_INPUT",
            issues: parsed.error.issues,
          },
        });
      }

      try {
        await xraysRepository.saveBoard(
          userId,
          parsed.data.visitId,
          parsed.data.objects as SaveXrayBoardObject[]
        );

        // Keep Storage cleanup outside the database transaction.
        // A cleanup failure must not turn a successful save into an error.
        try {
          await cleanupOrphans(parsed.data.visitId);
        } catch (error) {
          console.warn("X-ray orphan cleanup unexpectedly failed", {
            visitId: parsed.data.visitId,
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const board = await xraysRepository.findBoardByVisitId(parsed.data.visitId);
        if (!board) {
          throw new GraphQLError("X-ray board not found after save", {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }

        const assets = await xraysRepository.findAssetsByVisitId(parsed.data.visitId);
        return toXrayBoard(board, assets);
      } catch (error) {
        if (error instanceof XrayBoardError) {
          throw new GraphQLError(error.message, {
            extensions: { code: error.code },
          });
        }
        throw error;
      }
    },
  },
};
