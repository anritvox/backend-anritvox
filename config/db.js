const mysql = require("mysql2");
require("dotenv").config();

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
};

if (process.env.NODE_ENV === "production") {
  dbConfig.ssl = {
    rejectUnauthorized: false,
  };
} else if (process.env.DB_SSL_ENABLED === "true") {
  dbConfig.ssl = {
    rejectUnauthorized: false,
  };
}

const pool = mysql.createPool(dbConfig).promise();

module.exports = pool;
