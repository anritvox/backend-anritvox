// backend/models/wishlistModel.js
const pool = require('../config/db');

const createWishlistTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_wishlist (user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);
};

const addToWishlist = async (userId, productId) => {
  await pool.query(
    'INSERT IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)',
    [userId, productId]
  );
};

const removeFromWishlist = async (userId, productId) => {
  await pool.query(
    'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?',
    [userId, productId]
  );
};

const getWishlistByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT w.id, w.created_at,
      p.id as product_id, p.name, p.price, p.discount_price, p.quantity, p.status, p.images
      FROM wishlist w
      JOIN products p ON w.product_id = p.id
      WHERE w.user_id = ?`,
    [userId]
  );
  return rows;
};

const isInWishlist = async (userId, productId) => {
  const [rows] = await pool.query(
    'SELECT id FROM wishlist WHERE user_id = ? AND product_id = ?',
    [userId, productId]
  );
  return rows.length > 0;
};

module.exports = { createWishlistTable, addToWishlist, removeFromWishlist, getWishlistByUser, isInWishlist };
