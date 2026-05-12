import { GraphQLError } from "graphql";
import type { GraphQLContext } from "./context";

export const requireAuth = (context: GraphQLContext) => {
  if (!context.accessToken || !context.user?.id) {
    throw new GraphQLError("Unauthorized", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return {
    accessToken: context.accessToken,
    userId: context.user.id,
    email: context.user.email ?? null,
  };
};

export const requireRole = (
  context: GraphQLContext,
  allowedRoles: string[]
) => {
  const auth = requireAuth(context);
  const role = context.user?.role ?? null;

  if (!role || !allowedRoles.includes(String(role))) {
    throw new GraphQLError("Forbidden", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  return auth;
};
