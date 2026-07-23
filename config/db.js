const mysql = require('mysql2');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'railway',
  port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 3, 
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

if (process.env.DB_SSL === 'true' || process.env.MYSQL_URL || process.env.NODE_ENV === 'production') {
  dbConfig.ssl = {
    rejectUnauthorized: false
  };
}

const pool = mysql.createPool(process.env.MYSQL_URL || dbConfig);

module.exports = pool.promise();
