const pool = require('../config/db');
const bcrypt = require('bcrypt');

const createUsersTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      role ENUM('customer','admin') DEFAULT 'customer',
      is_active TINYINT(1) DEFAULT 1,
      reset_otp VARCHAR(10),
      reset_otp_expires BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};
// We export this to be controlled by server.js initialization, removing standalone catch to prevent race 

const createUser = async ({ name, email, password, phone }) => {
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)',
    [name, email, hash, phone || null]
  );
  return result.insertId;
};

const getUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

const getUserById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows[0];
};

const getAllUsers = async () => {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
};

const updateUser = async (id, { name, phone }) => {
  await pool.query('UPDATE users SET name=?, phone=? WHERE id=?', [name, phone, id]);
};

const updateUserPassword = async (id, newHash) => {
  await pool.query('UPDATE users SET password_hash=? WHERE id=?', [newHash, id]);
};

const saveResetOtp = async (id, otp, expiresAt) => {
  await pool.query(
    'UPDATE users SET reset_otp=?, reset_otp_expires=? WHERE id=?',
    [otp, expiresAt, id]
  );
};

const clearResetOtp = async (id) => {
  await pool.query(
    'UPDATE users SET reset_otp=NULL, reset_otp_expires=NULL WHERE id=?',
    [id]
  );
};

const updateUserStatus = async (id, is_active) => {
  await pool.query('UPDATE users SET is_active=? WHERE id=?', [is_active, id]);
};

const deleteUser = async (id) => {
  await pool.query('DELETE FROM users WHERE id=?', [id]);
};

const verifyPassword = async (password, hash) => bcrypt.compare(password, hash);

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  saveResetOtp,
  clearResetOtp,
  updateUserStatus,
  deleteUser,
  verifyPassword,
  createUsersTable,
};
