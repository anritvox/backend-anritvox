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
      wallet_balance DECIMAL(10,2) DEFAULT 0.00,
      two_factor_secret VARCHAR(255),
      two_factor_enabled TINYINT(1) DEFAULT 0,
      security_question VARCHAR(255) DEFAULT 'What is your mother\\'s maiden name?',
      security_answer_hash VARCHAR(255),
      reset_otp VARCHAR(10),
      reset_otp_expires BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
};

const createUser = async ({ name, email, password, phone, securityAnswer = 'default-answer' }) => {
  const hash = await bcrypt.hash(password, 10);
  const secHash = await bcrypt.hash(securityAnswer.toLowerCase(), 10);
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, phone, security_answer_hash) VALUES (?, ?, ?, ?, ?)',
    [name, email, hash, phone || null, secHash]
  );
  return result.insertId;
};

const getUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0];
};

const getUserById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, is_active, wallet_balance, two_factor_enabled, security_question, created_at FROM users WHERE id = ?',
    [id]
  );
  return rows[0];
};

const getAllUsers = async () => {
  const [rows] = await pool.query(
    'SELECT id, name, email, phone, role, is_active, wallet_balance, created_at FROM users ORDER BY created_at DESC'
  );
  return rows;
};

const updateUser = async (id, { name, phone }) => {
  await pool.query('UPDATE users SET name=?, phone=? WHERE id=?', [name, phone, id]);
};

// --- NEW WALLET HELPERS ---
const adjustWallet = async (conn, userId, amount, type, desc, refId = null) => {
  const [user] = await conn.query('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE', [userId]);
  const currentBalance = parseFloat(user[0].wallet_balance);
  const newBalance = type === 'credit' ? currentBalance + amount : currentBalance - amount;
  
  if (newBalance < 0) throw new Error("Insufficient wallet balance.");
  
  await conn.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, userId]);
  await conn.query(
    'INSERT INTO wallet_transactions (user_id, amount, type, description, reference_id) VALUES (?, ?, ?, ?, ?)',
    [userId, amount, type, desc, refId]
  );
  return newBalance;
};

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  adjustWallet, // Exported for Order logic
  createUsersTable,
  verifyPassword: async (password, hash) => bcrypt.compare(password, hash),
  verifySecurityAnswer: async (answer, hash) => bcrypt.compare(answer.toLowerCase(), hash),
};
