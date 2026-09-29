export const XRAY_BOARD_MAX_OBJECTS = 100;

export const XRAY_SLOT_CODE_PATTERN = /^(?:[1-9]|1[0-8]|io-[1-9])$/;

export const XRAY_NOTE_FONT_SIZE = {
  min: 10,
  max: 44,
} as const;

export type XrayObjectType = "image" | "note";
