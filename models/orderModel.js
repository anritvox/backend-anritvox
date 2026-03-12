// backend/models/orderModel.js
const pool = require('../config/db');

const createOrdersTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      address_snapshot JSON NOT NULL,
      delivery_type ENUM('standard','express') DEFAULT 'standard',
      payment_mode ENUM('COD') DEFAULT 'COD',
      status ENUM('pending','confirmed','shipped','delivered','cancelled') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      quantity INT NOT NULL,
      image VARCHAR(500),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);
};
createOrdersTables().catch(console.error);

const createOrder = async (userId, { items, total, addressSnapshot, deliveryType }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query(
      `INSERT INTO orders (user_id, total, address_snapshot, delivery_type, payment_mode)
       VALUES (?, ?, ?, ?, 'COD')`,
      [userId, total, JSON.stringify(addressSnapshot), deliveryType || 'standard']
    );
    const orderId = res.insertId;
    for (const item of items) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, name, price, quantity, image)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.name, item.price, item.quantity, item.images?.[0] || null]
      );
    }
    await conn.commit();
    return orderId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const getOrdersByUser = async (userId) => {
  const [orders] = await pool.query(
    'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',
    [userId]
  );
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
    o.address_snapshot = typeof o.address_snapshot === 'string' ? JSON.parse(o.address_snapshot) : o.address_snapshot;
  }
  return orders;
};

const getAllOrders = async () => {
  const [orders] = await pool.query(
    `SELECT o.*, u.name as customer_name, u.email as customer_email
     FROM orders o JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC`
  );
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
    o.address_snapshot = typeof o.address_snapshot === 'string' ? JSON.parse(o.address_snapshot) : o.address_snapshot;
  }
  return orders;
};

const updateOrderStatus = async (orderId, status) => {
  await pool.query('UPDATE orders SET status=? WHERE id=?', [status, orderId]);
};

const getOrderById = async (orderId) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
  order.items = items;
  order.address_snapshot = typeof order.address_snapshot === 'string' ? JSON.parse(order.address_snapshot) : order.address_snapshot;
  return order;
};

module.exports = { createOrder, getOrdersByUser, getAllOrders, updateOrderStatus, getOrderById };
