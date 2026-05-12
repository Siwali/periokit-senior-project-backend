import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import type { Express, Request } from "express";
import express from "express";
import { getContextFromAuthHeader } from "./context";
import { resolvers, typeDefs } from "./schema";

export const attachApolloServer = async (app: Express) => {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await apolloServer.start();

  app.use(
    "/graphql",
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }: { req: Request }) => {
        try {
          const authorization = req.headers.authorization;
          return await getContextFromAuthHeader(authorization);
        } catch (error) {
          console.error("Failed to build GraphQL context", error);
          return {};
        }
      },
    })
  );

  return apolloServer;
};
