import type { User } from "@supabase/supabase-js";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        accessToken: string;
        user: User;
      };
    }
  }
}

export {};
