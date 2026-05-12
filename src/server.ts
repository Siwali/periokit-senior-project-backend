import "dotenv/config";
import { env } from "./lib/env";
import app from "./app";
import { attachApolloServer } from "./graphql/apollo";

const PORT = env.PORT;

const start = async () => {
  await attachApolloServer(app);

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
