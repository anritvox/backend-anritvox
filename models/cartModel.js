// backend/models/cartModel.js
const pool = require('../config/db');

const createCartTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_product (user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

const getCartByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.quantity, ci.product_id,
        p.name, p.price, p.images
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = ?`,
    [userId]
  );
  return rows.map(r => ({
    ...r,
    images: (() => { try { return JSON.parse(r.images); } catch { return []; } })()
  }));
};

const upsertCartItem = async (userId, productId, quantity) => {
  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = ?`,
    [userId, productId, quantity, quantity]
  );
  return getCartByUser(userId);
};

const removeCartItem = async (userId, productId) => {
  await pool.query(
    'DELETE FROM cart_items WHERE user_id = ? AND product_id = ?',
    [userId, productId]
  );
  return getCartByUser(userId);
};

const clearCart = async (userId) => {
  await pool.query('DELETE FROM cart_items WHERE user_id = ?', [userId]);
};

module.exports = { getCartByUser, upsertCartItem, removeCartItem, clearCart, createCartTable };
