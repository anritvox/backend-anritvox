// backend/models/adminModel.js
const pool = require("../config/db");
const bcrypt = require("bcrypt");

const getAdminByEmail = async (email) => {
  const [rows] = await pool.query(
    `SELECT id, email, password_hash
       FROM admin_users
      WHERE email = ?`,
    [email]
  );
  return rows[0];
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

module.exports = {
  getAdminByEmail,
  verifyPassword,
};
