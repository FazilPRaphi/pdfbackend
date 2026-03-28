import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { processPdfJob } from "./services/pdfService.js";
import { upload } from "./middleware/uploadMiddleware.js";

dotenv.config();

const app = express();

// __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputsDir = path.join(__dirname, "outputs");
if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "https://atstrack-pdfs.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true,
  }),
);
app.use(express.json());

// In-memory job store
const jobs = {};

/**
 * 📄 MERGE PDF ROUTE
 */
app.post("/api/merge", upload.array("files", 5), async (req, res) => {
  try {
    const jobId = Date.now().toString();

    // 🔥 SAFETY CHECK
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const filePaths = req.files.map((file) => file.path);

    jobs[jobId] = { status: "processing" };

    processPdfJob("merge", { files: filePaths })
      .then((result) => {
        console.log("RESULT FROM SERVICE:", result);

        jobs[jobId] = {
          status: "completed",
          result: {
            ...result,
            downloadUrl: `/downloads/${result.file}`,
          },
        };
      })
      .catch((err) => {
        console.error("MERGE ERROR:", err);

        jobs[jobId] = {
          status: "failed",
          error: err.message,
        };
      });

    res.json({ jobId });
  } catch (err) {
    console.error("ROUTE ERROR:", err);
    res.status(500).json({ error: "Merge failed" });
  }
});

app.post("/api/split", upload.single("file"), async (req, res) => {
  try {
    const jobId = Date.now().toString();

    const { startPage, endPage } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    jobs[jobId] = { status: "processing" };

    processPdfJob("split", {
      file: req.file.path,
      startPage: parseInt(startPage),
      endPage: parseInt(endPage),
    })
      .then((result) => {
        jobs[jobId] = {
          status: "completed",
          result: {
            ...result,
            downloadUrl: `/downloads/${result.file}`,
          },
        };
      })
      .catch((err) => {
        jobs[jobId] = {
          status: "failed",
          error: err.message,
        };
      });

    res.json({ jobId });
  } catch (err) {
    console.error("SPLIT ROUTE ERROR:", err);
    res.status(500).json({ error: "Split failed" });
  }
});
app.post("/api/images-to-pdf", upload.array("images", 10), async (req, res) => {
  try {
    const jobId = Date.now().toString();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    const filePaths = req.files.map((file) => file.path);

    jobs[jobId] = { status: "processing" };

    processPdfJob("images", { files: filePaths })
      .then((result) => {
        jobs[jobId] = {
          status: "completed",
          result: {
            ...result,
            downloadUrl: `/downloads/${result.file}`,
          },
        };
      })
      .catch((err) => {
        jobs[jobId] = {
          status: "failed",
          error: err.message,
        };
      });

    res.json({ jobId });
  } catch (err) {
    console.error("IMAGE ROUTE ERROR:", err);
    res.status(500).json({ error: "Conversion failed" });
  }
});

app.post("/api/watermark", upload.single("file"), (req, res) => {
  const jobId = Date.now().toString();

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  jobs[jobId] = { status: "processing" };

  processPdfJob("watermark", {
    file: req.file.path,
    text: req.body.text,
  })
    .then((result) => {
      if (!result?.file) throw new Error("File generation failed");
      jobs[jobId] = {
        status: "completed",
        result: {
          file: result.file,
          downloadUrl: `/downloads/${result.file}`,
        },
      };
    })
    .catch((err) => {
      console.error(err);
      jobs[jobId] = { status: "failed", error: err.message };
    });

  res.json({ jobId });
});

app.post("/api/extract", upload.single("file"), (req, res) => {
  const jobId = Date.now().toString();

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const pages = req.body.pages.split(",").map(Number);

  jobs[jobId] = { status: "processing" };

  processPdfJob("extract", {
    file: req.file.path,
    pages,
  })
    .then((result) => {
      if (!result?.file) throw new Error("File generation failed");
      jobs[jobId] = {
        status: "completed",
        result: {
          file: result.file,
          downloadUrl: `/downloads/${result.file}`,
        },
      };
    })
    .catch((err) => {
      console.error(err);
      jobs[jobId] = { status: "failed", error: err.message };
    });

  res.json({ jobId });
});

app.post("/api/remove", upload.single("file"), (req, res) => {
  const jobId = Date.now().toString();

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const pages = req.body.pages.split(",").map(Number);

  jobs[jobId] = { status: "processing" };

  processPdfJob("remove", {
    file: req.file.path,
    pages,
  })
    .then((result) => {
      if (!result?.file) throw new Error("File generation failed");
      jobs[jobId] = {
        status: "completed",
        result: {
          file: result.file,
          downloadUrl: `/downloads/${result.file}`,
        },
      };
    })
    .catch((err) => {
      console.error(err);
      jobs[jobId] = { status: "failed", error: err.message };
    });

  res.json({ jobId });
});

app.post("/api/rotate", upload.single("file"), (req, res) => {
  const jobId = Date.now().toString();

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  jobs[jobId] = { status: "processing" };

  processPdfJob("rotate", {
    file: req.file.path,
    angle: req.body.angle,
  })
    .then((result) => {
      if (!result?.file) throw new Error("File generation failed");
      jobs[jobId] = {
        status: "completed",
        result: {
          file: result.file,
          downloadUrl: `/downloads/${result.file}`,
        },
      };
    })
    .catch((err) => {
      console.error(err);
      jobs[jobId] = { status: "failed", error: err.message };
    });

  res.json({ jobId });
});

/**
 * 📊 Job Status API
 */
app.get("/api/job/:id", (req, res) => {
  const job = jobs[req.params.id];

  if (!job) {
    return res.status(404).json({ status: "not found" });
  }

  res.json(job);
});

/**
 * ❤️ Health Check
 */
app.get("/", (req, res) => {
  res.send("PDF Toolkit API running 🚀");
});

/**
 * 📥 Serve files (ABSOLUTE PATH)
 */
app.use("/downloads", express.static(path.join(__dirname, "outputs")));

// Start server
const PORT = 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
