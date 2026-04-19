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

// Get cart with full product details + stock info
const getCartByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT ci.id, ci.quantity, ci.product_id,
     p.name, p.price, p.discount_price, p.quantity AS stock,
     p.status, p.sku, p.brand,
     (SELECT file_path FROM product_images WHERE product_id = p.id LIMIT 1) AS image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = ?`,
    [userId]
  );
  return rows.map((r) => ({
    ...r,
    unit_price: r.discount_price || r.price,
    subtotal: parseFloat(r.discount_price || r.price) * r.quantity,
  }));
};

// Add or update item with stock validation
// FIX: Increment quantity on duplicate instead of replacing it
const upsertCartItem = async (userId, productId, quantity) => {
  // Check product exists and is active
  const [products] = await pool.query(
    "SELECT id, quantity, status FROM products WHERE id = ?",
    [productId]
  );
  
  if (!products.length || products[0].status !== 'active') {
    throw { status: 400, message: 'Product is not available.' };
  }

  // Stock check (For "Add to Cart", we just check if it's generally in stock)
  if (products[0].quantity < quantity) {
    throw { status: 400, message: `Only ${products[0].quantity} item(s) available in stock.` };
  }

  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [userId, productId, quantity]
  );

  return getCartByUser(userId);
};

// New function specifically for setting quantity (used for manual updates in cart page)
const updateCartItemQuantity = async (userId, productId, quantity) => {
  if (quantity < 1) return removeCartItem(userId, productId);

  // Check stock
  const [products] = await pool.query(
    "SELECT id, quantity, status FROM products WHERE id = ?",
    [productId]
  );
  if (!products.length || products[0].status !== 'active') {
    throw { status: 400, message: 'Product is no longer available.' };
  }
  if (products[0].quantity < quantity) {
    throw { status: 400, message: `Only ${products[0].quantity} item(s) available.` };
  }

  await pool.query(
    'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?',
    [quantity, userId, productId]
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

// Get cart total (used at checkout)
const getCartTotal = async (userId) => {
  const items = await getCartByUser(userId);
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  return { items, total: parseFloat(total.toFixed(2)) };
};

module.exports = { 
  getCartByUser, 
  upsertCartItem, 
  updateCartItemQuantity,
  removeCartItem, 
  clearCart, 
  getCartTotal, 
  createCartTable 
};
