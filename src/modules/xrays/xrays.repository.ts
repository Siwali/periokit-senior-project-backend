import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  XRAY_BOARD_MAX_OBJECTS,
  XRAY_NOTE_FONT_SIZE,
  XRAY_SLOT_CODE_PATTERN,
  type XrayObjectType,
} from "./xrays.contract";

export type SaveXrayBoardObject = {
  objectType: XrayObjectType;
  zIndex: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation?: number | null;
  assetId?: string | null;
  slotCode?: string | null;
  noteText?: string | null;
  noteColor?: string | null;
  noteFontSize?: number | null;
};

const storedXrayBoardObjectSchema = z
  .object({
    id: z.string().uuid(),
    objectType: z.enum(["image", "note"]),
    zIndex: z.number().int(),
    posX: z.number().int(),
    posY: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rotation: z.number().min(0).lt(360),
    assetId: z.string().uuid().nullable(),
    slotCode: z.string().regex(XRAY_SLOT_CODE_PATTERN).nullable(),
    noteText: z.string().nullable(),
    noteColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    noteFontSize: z
      .number()
      .int()
      .min(XRAY_NOTE_FONT_SIZE.min)
      .max(XRAY_NOTE_FONT_SIZE.max)
      .nullable(),
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

type StoredXrayBoardObject = z.infer<typeof storedXrayBoardObjectSchema>;

type XrayCanvasData = {
  elements: StoredXrayBoardObject[];
};

const roundRotation = (rotation: number | null | undefined) =>
  Math.min(359.99, Math.round((rotation ?? 0) * 100) / 100);

const createCanvasData = (objects: SaveXrayBoardObject[]): XrayCanvasData => ({
  elements: objects.map((object) => ({
    id: randomUUID(),
    objectType: object.objectType,
    zIndex: object.zIndex,
    posX: object.posX,
    posY: object.posY,
    width: object.width,
    height: object.height,
    rotation: roundRotation(object.rotation),
    assetId: object.assetId ?? null,
    slotCode: object.slotCode ?? null,
    noteText: object.noteText ?? null,
    noteColor: object.noteColor ?? null,
    noteFontSize: object.noteFontSize ?? null,
  })),
});

const readCanvasObjects = (canvasData: Prisma.JsonValue): StoredXrayBoardObject[] => {
  const parsed = z
    .object({ elements: z.array(storedXrayBoardObjectSchema).max(XRAY_BOARD_MAX_OBJECTS) })
    .safeParse(canvasData);

  if (!parsed.success) throw new Error("Invalid X-ray canvas data");

  const assetIds = new Set<string>();
  const slotCodes = new Set<string>();
  for (const object of parsed.data.elements) {
    if (object.assetId && assetIds.has(object.assetId)) {
      throw new Error("Invalid X-ray canvas data");
    }
    if (object.slotCode && slotCodes.has(object.slotCode)) {
      throw new Error("Invalid X-ray canvas data");
    }
    if (object.assetId) assetIds.add(object.assetId);
    if (object.slotCode) slotCodes.add(object.slotCode);
  }

  return [...parsed.data.elements].sort(
    (left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)
  );
};

export class XrayBoardError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "BAD_USER_INPUT"
  ) {
    super(message);
    this.name = "XrayBoardError";
  }
}

export const xraysRepository = {
  async findOrphanedAssets(visitId: string) {
    return prisma.visit_xray_assets.findMany({
      where: { visit_id: visitId, status: "orphaned" },
      select: { asset_id: true, storage_path: true },
    });
  },

  async deleteAsset(assetId: string) {
    return prisma.visit_xray_assets.delete({ where: { asset_id: assetId } });
  },

  async markCleanupFailed(assetId: string) {
    return prisma.visit_xray_assets.update({
      where: { asset_id: assetId },
      data: { status: "cleanup_failed" },
    });
  },

  async saveBoard(
    userId: string,
    visitId: string,
    objects: SaveXrayBoardObject[]
  ) {
    return prisma.$transaction(async (tx) => {
      const visit = await tx.visits.findFirst({
        where: { visit_id: visitId, dentist_user_id: userId },
        select: { visit_id: true },
      });

      if (!visit) {
        throw new XrayBoardError("Visit not found", "NOT_FOUND");
      }

      const assetIds = objects.flatMap((object) =>
        object.assetId ? [object.assetId] : []
      );
      const uniqueAssetIds = [...new Set(assetIds)];
      const assets = uniqueAssetIds.length
        ? await tx.visit_xray_assets.findMany({
            where: { asset_id: { in: uniqueAssetIds } },
            select: { asset_id: true, visit_id: true },
          })
        : [];

      const hasInvalidAsset =
        assets.length !== uniqueAssetIds.length ||
        assets.some((asset) => asset.visit_id !== visitId);
      if (hasInvalidAsset) {
        throw new XrayBoardError("Invalid asset reference", "FORBIDDEN");
      }

      const canvasData = createCanvasData(objects) as Prisma.InputJsonValue;
      const savedAt = new Date();
      const board = await tx.xray_boards.upsert({
        where: { visit_id: visitId },
        create: {
          visit_id: visitId,
          status: "saved",
          canvas_data: canvasData,
          saved_at: savedAt,
        },
        update: {
          status: "saved",
          canvas_data: canvasData,
          saved_at: savedAt,
        },
      });

      await tx.visit_xray_assets.updateMany({
        where: { visit_id: visitId, asset_id: { in: uniqueAssetIds } },
        data: { status: "active" },
      });

      await tx.visit_xray_assets.updateMany({
        where: { visit_id: visitId, asset_id: { notIn: uniqueAssetIds } },
        data: { status: "orphaned" },
      });

      return board;
    });
  },

  async findAssetById(assetId: string) {
    return prisma.visit_xray_assets.findUnique({
      where: { asset_id: assetId },
    });
  },

  async createAsset(data: Parameters<typeof prisma.visit_xray_assets.create>[0]["data"]) {
    return prisma.visit_xray_assets.create({ data });
  },

  async findBoardByVisitId(visitId: string) {
    const board = await prisma.xray_boards.findUnique({
      where: { visit_id: visitId },
    });

    if (!board) return null;
    return {
      ...board,
      objects: readCanvasObjects(board.canvas_data).map((object) => ({
        object_id: object.id,
        object_type: object.objectType,
        z_index: object.zIndex,
        pos_x: object.posX,
        pos_y: object.posY,
        width: object.width,
        height: object.height,
        rotation: object.rotation,
        asset_id: object.assetId,
        slot_code: object.slotCode,
        note_text: object.noteText,
        note_color: object.noteColor,
        note_font_size: object.noteFontSize,
      })),
    };
  },

  async findAssetsByVisitId(visitId: string) {
    return prisma.visit_xray_assets.findMany({
      where: { visit_id: visitId },
      orderBy: { created_at: "asc" },
    });
  },

  async findAssetsByIds(assetIds: string[]) {
    return prisma.visit_xray_assets.findMany({
      where: { asset_id: { in: assetIds } },
    });
  },

  async findOwnedVisit(visitId: string, userId: string) {
    return prisma.visits.findFirst({
      where: { visit_id: visitId, dentist_user_id: userId },
      include: { patient: true },
    });
  },
};
