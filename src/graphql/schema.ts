import { userResolvers, userTypeDefs } from "./modules/user.graphql";

export const typeDefs = /* GraphQL */ `
  type Query {
    health: Health!
  }

  type Health {
    ok: Boolean!
    message: String!
  }
  ${userTypeDefs}
`;

export const resolvers = {
  Query: {
    health: () => ({
      ok: true,
      message: "PerioKit Backend API is running",
    }),
    ...userResolvers.Query,
  },
};
