// =============================================
// server.js - Unified Express Server logic
// =============================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const cloudinary = require("./cloudinary");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

// ---- Environment Detection ----
// process.env.VERCEL is automatically set by Vercel deployment
const isVercel = process.env.VERCEL === "1";

// ---- Middleware ----
app.use(cors());
app.use(express.json());
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// ---- Dynamic Multer Setup ----
let storage;
if (isVercel) {
  // Use memory storage for Vercel (serverless is read-only)
  storage = multer.memoryStorage();
  console.log("🛠️ Multer: Using Memory Storage (Vercel)");
} else {
  // Use disk storage for local development
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log("📁 Created uploads/ directory");
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + "-" + file.originalname);
    },
  });
  console.log("🛠️ Multer: Using Disk Storage (Local)");
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// =============================================
// POST /api/upload - Handle uploads dynamically
// =============================================
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    let result;
    if (isVercel) {
      // Stream upload from memory buffer (Vercel)
      console.log("📤 Streaming upload to Cloudinary (Buffer)");
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products" },
          (error, res) => {
            if (res) resolve(res);
            else reject(error);
          }
        );
        stream.end(req.file.buffer);
      });
    } else {
      // Path upload (Local)
      console.log("📤 Uploading from file path:", req.file.path);
      result = await cloudinary.uploader.upload(req.file.path, {
        folder: "products",
      });
      // Delete temp local file after successful upload
      fs.unlinkSync(req.file.path);
    }

    console.log("☁️ Cloudinary Success:", result.secure_url);

    // Save to database
    const dbResult = await pool.query(
      "INSERT INTO products (image_url, public_id) VALUES ($1, $2) RETURNING id::text as id, image_url, public_id",
      [result.secure_url, result.public_id]
    );

    res.status(201).json({
      message: "Image uploaded successfully!",
      product: dbResult.rows[0],
    });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    // Cleanup local file if it exists on error
    if (!isVercel && req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// =============================================
// GET /api/products - Fetch products
// =============================================
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id::text as id, image_url, public_id FROM products ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch: " + err.message });
  }
});

// =============================================
// DELETE /api/delete/:id - Delete product
// =============================================
app.delete("/api/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const dbCheck = await pool.query("SELECT public_id FROM products WHERE id = $1", [id]);
    
    if (dbCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const { public_id } = dbCheck.rows[0];

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(public_id);

    // Delete from DB
    await pool.query("DELETE FROM products WHERE id = $1", [id]);

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed: " + err.message });
  }
});

// ---- Deployment Handler ----
// If NOT on Vercel, start the Express listener
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Local Server running at http://localhost:${PORT}`);
  });
}

// Export the app for Vercel serverless function use
module.exports = app;
