import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { createCorsOptions } from "./config/cors.js";
import authRoutes from "./routes/authRoutes.js";
import chapterRoutes from "./routes/chapterRoutes.js";
import cloudMappingRoutes from "./routes/cloudMappingRoutes.js";
import contentRoutes from "./routes/contentRoutes.js";
import paperRoutes from "./routes/paperRoutes.js";
import programmeRoutes from "./routes/programmeRoutes.js";
import progressRoutes from "./routes/progressRoutes.js";
import subjectRoutes from "./routes/subjectRoutes.js";
import vocabularyRoutes from "./routes/vocabularyRoutes.js";
import telegramRoutes from "./routes/telegramRoutes.js";
import { errorHandler, notFound } from "./middlewares/errorMiddleware.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.resolve(__dirname, "..", "..", "uploads");

app.use(cors(createCorsOptions()));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  })
);
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadsPath));
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/programmes", programmeRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/chapters", chapterRoutes);
app.use("/api/contents", contentRoutes);
app.use("/api/papers", paperRoutes);
app.use("/api/progress", progressRoutes);
app.use("/api/vocabulary", vocabularyRoutes);
app.use("/api/cloud-mappings", cloudMappingRoutes);
app.use("/api/telegram", telegramRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
