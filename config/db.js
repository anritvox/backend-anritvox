// backend/config/db.js
const mysql = require("mysql2");
require("dotenv").config();

// Create a connection pool with TCP keep-alive enabled
const pool = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // ── Enable TCP keep-alive so Railway doesn’t drop idle sockets ──
    enableKeepAlive: true,
    keepAliveInitialDelay: 60000, // first ping after 60 s idle

    // Optionally increase acquireTimeout if you see “Timeout acquiring connection”:
    acquireTimeout: 10000, // 10 seconds
  })
  .promise();

module.exports = pool;
