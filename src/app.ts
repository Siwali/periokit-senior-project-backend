import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./routes/health.routes";

const app = express();

app.disable("x-powered-by");

const allowedOrigins = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://localhost:3000"];

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));

app.use("/", healthRoutes);
app.use("/auth", authRoutes);

export default app;
