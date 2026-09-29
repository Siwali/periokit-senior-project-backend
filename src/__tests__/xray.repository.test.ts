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
        rotation: 15,
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
    });
    expect(elements[1]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      objectType: "note",
      assetId: null,
      noteText: "Bone loss",
    });
    expect(upsert.update.canvas_data).toBe(upsert.create.canvas_data);
  });

  it("reads and sorts JSON elements in the existing repository response shape", async () => {
    mocks.findBoard.mockResolvedValue({
      board_id: "board-1",
      visit_id: "visit-1",
      status: "saved",
      canvas_data: {
        elements: [
          {
            id: "object-2",
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
            id: "object-1",
            objectType: "image",
            zIndex: 0,
            posX: 10,
            posY: 20,
            width: 300,
            height: 200,
            rotation: 15,
            assetId: "asset-1",
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
      expect.objectContaining({ object_id: "object-1", z_index: 0, asset_id: "asset-1" }),
      expect.objectContaining({ object_id: "object-2", z_index: 2, note_text: "Note" }),
    ]);
  });
});
