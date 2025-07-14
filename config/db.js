// backend/config/db.js
const mysql = require("mysql2");
require("dotenv").config();

const pool = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // Keep-alive so Railway won’t drop idle sockets
    // enableKeepAlive: true,
    // keepAliveInitialDelay: 600000, // ping after 60s idle

    // If you need to adjust how long to wait when *connecting*:
    connectTimeout: 10000, // 10s
  })
  .promise();

module.exports = pool;
