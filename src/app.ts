import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./routes/health.routes";

const app = express();

const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

app.use("/", healthRoutes);
app.use("/auth", authRoutes);

export default app;