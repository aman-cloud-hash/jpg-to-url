// api/index.js - Vercel Serverless Function entrypoint
// Simply imports and exports the main app logic from server.js
const app = require("../server");
module.exports = app;
