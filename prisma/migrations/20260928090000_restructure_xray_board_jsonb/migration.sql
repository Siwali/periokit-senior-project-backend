-- Replace row-per-element board storage with one JSONB document per board.
-- Existing board elements are intentionally discarded because this migration
-- targets the development environment and does not preserve X-ray board data.
ALTER TABLE "public"."xray_boards"
ADD COLUMN "canvas_data" JSONB NOT NULL DEFAULT '{"elements":[]}'::jsonb;

ALTER TABLE "public"."xray_boards"
ADD CONSTRAINT "xray_canvas_data_valid"
CHECK (
    jsonb_typeof("canvas_data") = 'object'
    AND "canvas_data" ? 'elements'
    AND jsonb_typeof("canvas_data" -> 'elements') = 'array'
    AND jsonb_array_length("canvas_data" -> 'elements') <= 100
);

DROP TABLE "public"."xray_board_objects";
DROP TYPE "public"."xray_object_type";
