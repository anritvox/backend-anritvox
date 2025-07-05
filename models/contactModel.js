// backend/models/contactModel.js
const pool = require("../config/db");

// Fetch all contact messages (for admin)
const getAllMessages = async () => {
  const [rows] = await pool.query(
    `SELECT id, name, email, phone, message, created_at
     FROM contact_messages
     ORDER BY created_at DESC`
  );
  return rows;
};

// Insert a new contact message
const createMessage = async ({ name, email, phone, message }) => {
  const [result] = await pool.query(
    `INSERT INTO contact_messages (name, email, phone, message)
     VALUES (?, ?, ?, ?)`,
    [name, email, phone, message]
  );
  return { id: result.insertId };
};

module.exports = {
  getAllMessages,
  createMessage,
};
