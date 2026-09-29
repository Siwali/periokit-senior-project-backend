import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findBoard: vi.fn(),
  findVisit: vi.fn(),
  findAssets: vi.fn(),
  upsertBoard: vi.fn(),
  updateAssets: vi.fn(),
}));

vi.mock("../lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    xray_boards: { findUnique: mocks.findBoard },
  },
}));

import { xraysRepository } from "../modules/xrays/xrays.repository";

describe("X-ray JSON board repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        visits: { findFirst: mocks.findVisit },
        visit_xray_assets: {
          findMany: mocks.findAssets,
          updateMany: mocks.updateAssets,
        },
        xray_boards: { upsert: mocks.upsertBoard },
      })
    );
  });

  it("stores the complete board as one JSON document with server-generated element IDs", async () => {
    mocks.findVisit.mockResolvedValue({ visit_id: "visit-1" });
    mocks.findAssets.mockResolvedValue([
      { asset_id: "550e8400-e29b-41d4-a716-446655440000", visit_id: "visit-1" },
    ]);
    mocks.upsertBoard.mockResolvedValue({ board_id: "board-1" });

    await xraysRepository.saveBoard("user-1", "visit-1", [
      {
        objectType: "image",
        assetId: "550e8400-e29b-41d4-a716-446655440000",
        slotCode: "1",
        zIndex: 0,
        posX: 10,
        posY: 20,
        width: 300,
        height: 200,
        rotation: 15.126,
      },
      {
        objectType: "note",
        zIndex: 1,
        posX: 40,
        posY: 50,
        width: 180,
        height: 80,
        noteText: "Bone loss",
        noteColor: "#FF0000",
        noteFontSize: 18,
      },
    ]);

    const upsert = mocks.upsertBoard.mock.calls[0][0];
    const elements = upsert.create.canvas_data.elements;
    expect(elements).toHaveLength(2);
    expect(elements[0]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      objectType: "image",
      assetId: "550e8400-e29b-41d4-a716-446655440000",
      slotCode: "1",
      width: 300,
      height: 200,
      rotation: 15.13,
    });
    expect(elements[1]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      objectType: "note",
      assetId: null,
      noteText: "Bone loss",
    });
    expect(upsert.update.canvas_data).toBe(upsert.create.canvas_data);
  });

  it("stores an empty board so all visit assets can be orphaned", async () => {
    mocks.findVisit.mockResolvedValue({ visit_id: "visit-1" });
    mocks.upsertBoard.mockResolvedValue({ board_id: "board-1" });

    await xraysRepository.saveBoard("user-1", "visit-1", []);

    const upsert = mocks.upsertBoard.mock.calls[0][0];
    expect(upsert.create.canvas_data).toEqual({ elements: [] });
    expect(upsert.update.canvas_data).toBe(upsert.create.canvas_data);
    expect(mocks.updateAssets).toHaveBeenLastCalledWith({
      where: { visit_id: "visit-1", asset_id: { notIn: [] } },
      data: { status: "orphaned" },
    });
  });

  it("reads and sorts JSON elements in the existing repository response shape", async () => {
    mocks.findBoard.mockResolvedValue({
      board_id: "board-1",
      visit_id: "visit-1",
      status: "saved",
      canvas_data: {
        elements: [
          {
            id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
            objectType: "note",
            zIndex: 2,
            posX: 40,
            posY: 50,
            width: 180,
            height: 80,
            rotation: 0,
            assetId: null,
            slotCode: null,
            noteText: "Note",
            noteColor: "#000000",
            noteFontSize: 18,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            objectType: "image",
            zIndex: 0,
            posX: 10,
            posY: 20,
            width: 300,
            height: 200,
            rotation: 15,
            assetId: "550e8400-e29b-41d4-a716-446655440000",
            slotCode: "1",
            noteText: null,
            noteColor: null,
            noteFontSize: null,
          },
        ],
      },
    });

    const board = await xraysRepository.findBoardByVisitId("visit-1");

    expect(board?.objects).toEqual([
      expect.objectContaining({
        object_id: "550e8400-e29b-41d4-a716-446655440001",
        z_index: 0,
        asset_id: "550e8400-e29b-41d4-a716-446655440000",
      }),
      expect.objectContaining({
        object_id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
        z_index: 2,
        note_text: "Note",
      }),
    ]);
  });

  it("rejects malformed JSON elements instead of returning an invalid API shape", async () => {
    mocks.findBoard.mockResolvedValue({
      board_id: "board-1",
      visit_id: "visit-1",
      status: "saved",
      canvas_data: {
        elements: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            objectType: "image",
            zIndex: 0,
            posX: 0,
            posY: 0,
            width: -1,
            height: 100,
            rotation: 0,
            assetId: null,
            slotCode: null,
            noteText: null,
            noteColor: null,
            noteFontSize: null,
          },
        ],
      },
    });

    await expect(xraysRepository.findBoardByVisitId("visit-1")).rejects.toThrow(
      "Invalid X-ray canvas data"
    );
  });
});
