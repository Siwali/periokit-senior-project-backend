import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./routes/health.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", healthRoutes);
app.use("/auth", authRoutes);

export default app;