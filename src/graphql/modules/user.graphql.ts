import { getAuthenticatedUserProfile } from "../../modules/auth/auth.service";
import type { GraphQLContext } from "../context";
import { requireAuth } from "../guards";

export const userTypeDefs = /* GraphQL */ `
  type User {
    id: ID!
    email: String
  }

  type Profile {
    firstName: String!
    lastName: String!
    role: String!
    studentId: Int
    profileImageUrl: String
  }

  type MeResult {
    user: User!
    profile: Profile!
  }

  extend type Query {
    me: MeResult!
  }
`;

export const userResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      const { userId, email } = requireAuth(context);
      const profile = await getAuthenticatedUserProfile(userId);

      return {
        user: {
          id: userId,
          email,
        },
        profile: {
          firstName: profile.first_name,
          lastName: profile.last_name,
          role: profile.role,
          studentId: profile.student_id,
          profileImageUrl: profile.profile_image_url,
        },
      };
    },
  },
};

