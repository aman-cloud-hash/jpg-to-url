// =============================================
// api/index.js - Vercel Serverless Function entrypoint
// =============================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

// Import modules from the root (Vercel will bundle them)
const cloudinary = require("../cloudinary");
const pool = require("../db");

const app = express();

// ---- Middleware ----
app.use(cors());
app.use(express.json());

// ---- Multer Setup (Memory Storage for Vercel) ----
const storage = multer.memoryStorage(); // Vercel is read-only, use memory

// Only allow image files
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (jpg, png, gif, webp) are allowed!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // increased to 10MB to be safe
});

// =============================================
// POST /api/upload - Upload to Cloudinary & DB
// =============================================
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      console.log("⚠️ No file received");
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log("📤 Uploading from memory:", req.file.originalname);

    // Upload to Cloudinary via stream from memory
    const streamUpload = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        stream.end(fileBuffer);
      });
    };

    const result = await streamUpload(req.file.buffer);

    console.log("☁️ Cloudinary upload success:", result.secure_url);

    // Save with String IDs for precision in Javascript
    const dbResult = await pool.query(
      "INSERT INTO products (image_url, public_id) VALUES ($1, $2) RETURNING id::text as id, image_url, public_id",
      [result.secure_url, result.public_id]
    );

    console.log("💾 Saved to database, ID:", dbResult.rows[0].id);

    res.status(201).json({
      message: "Image uploaded successfully!",
      product: dbResult.rows[0],
    });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// =============================================
// GET /api/products - Fetch all products
// =============================================
app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id::text as id, image_url, public_id FROM products ORDER BY id DESC"
    );
    console.log(`📦 Fetched ${result.rows.length} products`);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch: " + err.message });
  }
});

// =============================================
// DELETE /api/delete/:id - Delete from Cloud & DB
// =============================================
app.delete("/api/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get record
    const dbCheck = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    
    if (dbCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found in database" });
    }

    const { public_id } = dbCheck.rows[0];

    // 2. Cloudinary delete
    await cloudinary.uploader.destroy(public_id);

    // 3. Database delete
    const dbResult = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING id::text as id",
      [id]
    );

    console.log("🗑️ Deleted ID:", id);
    res.json({ message: "Deleted successfully", product: dbResult.rows[0] });
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ error: "Delete failed: " + err.message });
  }
});

// Important: NO app.listen() for Vercel
module.exports = app;
