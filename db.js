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
        id SERIAL PRIMARY KEY,
        image_url TEXT NOT NULL,
        public_id TEXT NOT NULL
      );
    `);
    console.log("✅ Products table is ready (with public_id support)");
  } catch (err) {
    console.error("❌ Error creating table:", err.message);
  }
};

createTable();

module.exports = pool;
