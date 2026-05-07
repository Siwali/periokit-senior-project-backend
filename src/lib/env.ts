import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_PROFILE_IMAGES_BUCKET: z.string().default("profile-images"),
  SUPABASE_PROFILE_IMAGE_SIGNED_URL_EXPIRES_IN: z.coerce.number().default(604800),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ALLOWED_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// This will throw an error and crash the server if validation fails
export const env = envSchema.parse(process.env);
