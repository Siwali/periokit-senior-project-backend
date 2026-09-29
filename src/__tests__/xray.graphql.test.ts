import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOwnedVisit: vi.fn(),
  findBoardByVisitId: vi.fn(),
  findAssetsByVisitId: vi.fn(),
  findAssetsByIds: vi.fn(),
  saveBoard: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("../modules/xrays/xrays.repository", () => ({
  xraysRepository: {
    findOwnedVisit: mocks.findOwnedVisit,
    findBoardByVisitId: mocks.findBoardByVisitId,
    findAssetsByVisitId: mocks.findAssetsByVisitId,
    findAssetsByIds: mocks.findAssetsByIds,
    saveBoard: mocks.saveBoard,
  },
}));

vi.mock("../lib/env", () => ({
  env: {
    SUPABASE_XRAY_BUCKET: "xray-images",
    SUPABASE_XRAY_SIGNED_URL_EXPIRES_IN: 14400,
  },
}));

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    storage: {
      from: vi.fn(() => ({ createSignedUrls: mocks.createSignedUrls })),
    },
  },
}));

import { GraphQLError } from "graphql";
import { xrayResolvers } from "../graphql/modules/xray.graphql";

const authContext = { accessToken: "token", user: { id: "user-1" } };
const board = {
  board_id: "board-1",
  visit_id: "visit-1",
  status: "saved",
  saved_at: new Date("2026-08-25T10:00:00.000Z"),
  objects: [
    {
      object_id: "object-1",
      object_type: "image",
      z_index: 1,
      pos_x: 0,
      pos_y: 0,
      width: 100,
      height: 100,
      rotation: "0.00",
      asset_id: "asset-1",
      slot_code: null,
      note_text: null,
      note_color: null,
      note_font_size: null,
    },
  ],
};
const asset = {
  asset_id: "asset-1",
  visit_id: "visit-1",
  storage_path: "visit-1/asset-1.jpg",
  file_name: "xray.jpg",
  mime_type: "image/jpeg",
  file_size: 1000,
  natural_width: 100,
  natural_height: 100,
  status: "active",
};

describe("xray resolvers", () => {
  it("rejects missing authorization without querying data", async () => {
    await expect(
      xrayResolvers.Query.xrayBoardByVisit({}, { visitId: "visit-1" }, {})
    ).rejects.toMatchObject({ extensions: { code: "UNAUTHENTICATED" } });
    expect(mocks.findOwnedVisit).not.toHaveBeenCalled();
  });

  it("rejects an expired or invalid token context", async () => {
    await expect(
      xrayResolvers.Query.xrayBoardByVisit(
        {},
        { visitId: "visit-1" },
        { accessToken: "expired" }
      )
    ).rejects.toBeInstanceOf(GraphQLError);
    expect(mocks.findOwnedVisit).not.toHaveBeenCalled();
  });

  it("does not reveal whether an unowned or missing visit exists", async () => {
    mocks.findOwnedVisit.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    for (const visitId of ["other-visit", "missing-visit"]) {
      await expect(
        xrayResolvers.Query.xrayBoardByVisit({}, { visitId }, authContext)
      ).rejects.toMatchObject({
        message: "Visit not found",
        extensions: { code: "NOT_FOUND" },
      });
    }

    expect(mocks.findBoardByVisitId).not.toHaveBeenCalled();
    expect(mocks.findAssetsByVisitId).not.toHaveBeenCalled();
  });

  it("returns null without creating a board when none exists", async () => {
    mocks.findOwnedVisit.mockResolvedValue({ visit_id: "visit-1" });
    mocks.findBoardByVisitId.mockResolvedValue(null);

    await expect(
      xrayResolvers.Query.xrayBoardByVisit({}, { visitId: "visit-1" }, authContext)
    ).resolves.toBeNull();
    expect(mocks.findAssetsByVisitId).not.toHaveBeenCalled();
  });

  it("returns a board with sorted objects and signed assets", async () => {
    mocks.findOwnedVisit.mockResolvedValue({ visit_id: "visit-1" });
    mocks.findBoardByVisitId.mockResolvedValue(board);
    mocks.findAssetsByVisitId.mockResolvedValue([asset]);
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ path: asset.storage_path, signedUrl: "https://signed.example/xray" }],
      error: null,
    });

    const result = await xrayResolvers.Query.xrayBoardByVisit(
      {},
      { visitId: "visit-1" },
      authContext
    );

    expect(result).toMatchObject({
      id: "board-1",
      visitId: "visit-1",
      objects: [{ id: "object-1", rotation: 0 }],
      assets: [{ id: "asset-1", signedUrl: "https://signed.example/xray" }],
    });
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      [asset.storage_path],
      14400
    );
  });

  it("refreshes only assets belonging to the authenticated user's visits", async () => {
    const otherAsset = { ...asset, asset_id: "asset-2", visit_id: "other-visit" };
    mocks.findAssetsByIds.mockResolvedValue([asset, otherAsset]);
    mocks.findOwnedVisit.mockImplementation(async (visitId: string) =>
      visitId === "visit-1" ? { visit_id: visitId } : null
    );
    mocks.createSignedUrls.mockResolvedValue({
      data: [{ path: asset.storage_path, signedUrl: "https://signed.example/new" }],
      error: null,
    });

    const result = await xrayResolvers.Query.refreshXrayUrls(
      {},
      { assetIds: [asset.asset_id, otherAsset.asset_id] },
      authContext
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "asset-1" });
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(
      [asset.storage_path],
      14400
    );
  });

  it("rejects invalid image objects before opening a transaction", async () => {
    await expect(
      xrayResolvers.Mutation.saveXrayBoard(
        {},
        {
          input: {
            visitId: "550e8400-e29b-41d4-a716-446655440000",
            objects: [
              {
                objectType: "image",
                zIndex: 0,
                posX: 0,
                posY: 0,
                width: 100,
                height: 100,
              },
            ],
          },
        },
        authContext
      )
    ).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });

  it("rejects invalid note color and font size before opening a transaction", async () => {
    await expect(
      xrayResolvers.Mutation.saveXrayBoard(
        {},
        {
          input: {
            visitId: "550e8400-e29b-41d4-a716-446655440000",
            objects: [
              {
                objectType: "note",
                zIndex: 0,
                posX: 0,
                posY: 0,
                width: 100,
                height: 100,
                noteColor: "red",
                noteFontSize: 72,
              },
            ],
          },
        },
        authContext
      )
    ).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });

  it("rejects duplicate assets and occupied slots before opening a transaction", async () => {
    const assetId = "550e8400-e29b-41d4-a716-446655440000";
    const image = {
      objectType: "image",
      assetId,
      slotCode: "1",
      zIndex: 0,
      posX: 0,
      posY: 0,
      width: 100,
      height: 100,
    };

    await expect(
      xrayResolvers.Mutation.saveXrayBoard(
        {},
        {
          input: {
            visitId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
            objects: [image, { ...image, zIndex: 1 }],
          },
        },
        authContext
      )
    ).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });

  it("rejects unknown slot codes and notes assigned to slots", async () => {
    for (const object of [
      {
        objectType: "image",
        assetId: "550e8400-e29b-41d4-a716-446655440000",
        slotCode: "fmx-99",
      },
      { objectType: "note", slotCode: "1" },
    ]) {
      await expect(
        xrayResolvers.Mutation.saveXrayBoard(
          {},
          {
            input: {
              visitId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
              objects: [
                {
                  ...object,
                  zIndex: 0,
                  posX: 0,
                  posY: 0,
                  width: 100,
                  height: 100,
                },
              ],
            },
          },
          authContext
        )
      ).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
    }
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });

  it("rejects boards with more than 100 objects", async () => {
    const objects = Array.from({ length: 101 }, (_, index) => ({
      objectType: "note",
      zIndex: index,
      posX: index,
      posY: index,
      width: 100,
      height: 100,
    }));

    await expect(
      xrayResolvers.Mutation.saveXrayBoard(
        {},
        {
          input: {
            visitId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
            objects,
          },
        },
        authContext
      )
    ).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
    expect(mocks.saveBoard).not.toHaveBeenCalled();
  });
});
