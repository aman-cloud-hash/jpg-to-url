// =============================================
// server.js - Express Server (Main Entry Point)
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

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Multer Setup (Temporary Storage) ----
// Ensure uploads/ folder exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
  console.log("📁 Created uploads/ directory");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    // Add timestamp to avoid name conflicts
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// =============================================
// POST /api/upload - Upload image to Cloudinary & save URL in DB
// =============================================
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      console.log("⚠️ No file received in request");
      return res.status(400).json({ error: "No image file provided" });
    }

    console.log("📤 Uploading file:", req.file.originalname);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "products",
    });

    console.log("☁️ Cloudinary upload success:", result.secure_url);
    console.log("🔑 Cloudinary Public ID:", result.public_id);

    // Delete the temporary file
    fs.unlinkSync(req.file.path);
    console.log("🗑️ Temporary file deleted");

    // Save the URL AND Public ID in CockroachDB
    const dbResult = await pool.query(
      "INSERT INTO products (image_url, public_id) VALUES ($1, $2) RETURNING *",
      [result.secure_url, result.public_id]
    );

    const newProduct = {
      ...dbResult.rows[0],
      id: dbResult.rows[0].id.toString()
    };

    console.log("💾 Saved to database, ID:", newProduct.id);

    res.status(201).json({
      message: "Image uploaded successfully!",
      product: newProduct,
    });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: "Upload failed: " + err.message });
  }
});

// =============================================
// GET /api/products - Fetch all products from DB
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
    res.status(500).json({ error: "Failed to fetch products: " + err.message });
  }
});

// =============================================
// DELETE /api/delete/:id - Delete from Cloudinary & DB
// =============================================
app.delete("/api/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get the record from DB to get the public_id
    const dbCheck = await pool.query("SELECT * FROM products WHERE id = $1", [id]);
    
    if (dbCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found in database" });
    }

    const { public_id } = dbCheck.rows[0];

    // 2. Delete from Cloudinary
    console.log(`☁️ Deleting from Cloudinary: ${public_id}`);
    const cloudResult = await cloudinary.uploader.destroy(public_id);
    
    if (cloudResult.result !== "ok" && cloudResult.result !== "not found") {
      console.warn("⚠️ Cloudinary delete warning:", cloudResult);
    }

    // 3. Delete from database
    const dbResult = await pool.query(
      "DELETE FROM products WHERE id = $1 RETURNING *",
      [id]
    );

    console.log("🗑️ Deleted from DB, ID:", id);
    res.json({ message: "Product deleted from Cloudinary and DB", product: dbResult.rows[0] });
  } catch (err) {
    console.error("❌ Delete error:", err.message);
    res.status(500).json({ error: "Failed to delete: " + err.message });
  }
});

// ---- Start Server ----
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📂 Frontend at http://localhost:${PORT}/index.html\n`);
});
