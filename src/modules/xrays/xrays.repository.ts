import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export type SaveXrayBoardObject = {
  objectType: string;
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

type StoredXrayBoardObject = {
  id: string;
  objectType: string;
  zIndex: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  assetId: string | null;
  slotCode: string | null;
  noteText: string | null;
  noteColor: string | null;
  noteFontSize: number | null;
};

type XrayCanvasData = {
  elements: StoredXrayBoardObject[];
};

const createCanvasData = (objects: SaveXrayBoardObject[]): XrayCanvasData => ({
  elements: objects.map((object) => ({
    id: randomUUID(),
    objectType: object.objectType,
    zIndex: object.zIndex,
    posX: object.posX,
    posY: object.posY,
    width: object.width,
    height: object.height,
    rotation: object.rotation ?? 0,
    assetId: object.assetId ?? null,
    slotCode: object.slotCode ?? null,
    noteText: object.noteText ?? null,
    noteColor: object.noteColor ?? null,
    noteFontSize: object.noteFontSize ?? null,
  })),
});

const readCanvasObjects = (canvasData: Prisma.JsonValue): StoredXrayBoardObject[] => {
  if (
    !canvasData ||
    Array.isArray(canvasData) ||
    typeof canvasData !== "object" ||
    !Array.isArray(canvasData.elements)
  ) {
    throw new Error("Invalid X-ray canvas data");
  }

  return [...(canvasData.elements as StoredXrayBoardObject[])].sort(
    (left, right) => left.zIndex - right.zIndex
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
