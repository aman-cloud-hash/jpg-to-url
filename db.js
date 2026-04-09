// =============================================
// db.js - CockroachDB (PostgreSQL) Connection
// =============================================

const { Pool } = require("pg");
require("dotenv").config();

// Create a connection pool to CockroachDB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for CockroachDB cloud
  },
});

// Test the database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
  } else {
    console.log("✅ Connected to CockroachDB at:", res.rows[0].now);
  }
});

// Create the products table if it doesn't exist
const createTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT8 NOT NULL DEFAULT unique_rowid(),
        image_url STRING NULL,
        public_id STRING NULL,
        title STRING NULL,
        price DECIMAL NULL,
        category STRING NULL,
        description STRING NULL,
        material STRING NULL,
        is_featured BOOL NULL DEFAULT false,
        is_trending BOOL NULL DEFAULT false,
        created_at TIMESTAMP NULL DEFAULT current_timestamp():::TIMESTAMP,
        CONSTRAINT products_pkey PRIMARY KEY (id ASC)
      );
    `);
    console.log("✅ Products table is ready (with public_id support)");
  } catch (err) {
    console.error("❌ Error creating table:", err.message);
  }
};

createTable();

module.exports = pool;
