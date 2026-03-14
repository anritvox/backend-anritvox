// backend/models/orderModel.js
const pool = require('../config/db');

const createOrdersTables = async () => {
  // 1. Create the base table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      address_snapshot JSON NOT NULL,
      delivery_type ENUM('standard','express') DEFAULT 'standard',
      payment_mode ENUM('COD','online') DEFAULT 'COD',
      status ENUM('pending','confirmed','packed','shipped','delivered','cancelled','returned') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 2. Safe Column Additions (Removes 'IF NOT EXISTS' which breaks on many MySQL versions)
  // We wrap each in a try/catch. If the column exists, it throws a safe "Duplicate Column" error and moves on.
  const addColumn = async (sql) => {
    try { await pool.query(`ALTER TABLE orders ADD COLUMN ${sql}`); } catch (e) {}
  };

  await addColumn("subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER user_id");
  await addColumn("discount DECIMAL(10,2) DEFAULT 0 AFTER subtotal");
  await addColumn("total DECIMAL(10,2) NOT NULL AFTER discount");
  await addColumn("coupon_code VARCHAR(50) AFTER total");
  await addColumn("payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'pending' AFTER payment_mode");
  await addColumn("payment_id VARCHAR(255) AFTER payment_status");
  await addColumn("cancel_reason TEXT AFTER status");
  await addColumn("notes TEXT AFTER cancel_reason");

  try {
    await pool.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending','confirmed','packed','shipped','delivered','cancelled','returned') DEFAULT 'pending'");
  } catch(e) {}

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100),
      price DECIMAL(10,2) NOT NULL,
      quantity INT NOT NULL,
      image VARCHAR(500),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);
};

// Create order in a transaction
const createOrder = async (userId, { items, subtotal, discount, total, couponCode, addressSnapshot, deliveryType, paymentMode, notes }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.query(
      `INSERT INTO orders (user_id, subtotal, discount, total, coupon_code, address_snapshot, delivery_type, payment_mode, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, subtotal, discount || 0, total, couponCode || null,
       JSON.stringify(addressSnapshot), deliveryType || 'standard',
       paymentMode || 'COD', notes || null]
    );
    
    const orderId = res.insertId;
    
    for (const item of items) {
      // Safely extract a single image URL, even if the database has it stored as a JSON array
      let itemImage = item.image || item.images || null;
      if (Array.isArray(itemImage)) itemImage = itemImage[0];
      else if (typeof itemImage === 'string' && itemImage.startsWith('[')) {
        try { itemImage = JSON.parse(itemImage)[0]; } catch(e){}
      }

      // Fallback guarantees we always have a price
      const price = item.unit_price || item.price || 0;

      await conn.query(
        `INSERT INTO order_items (order_id, product_id, name, sku, price, quantity, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id || item.id, item.name || 'Unknown Product', item.sku || null,
         price, item.quantity || 1, itemImage]
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

const parseOrder = (o) => ({
  ...o,
  address_snapshot: typeof o.address_snapshot === 'string'
    ? JSON.parse(o.address_snapshot)
    : o.address_snapshot,
});

const getOrdersByUser = async (userId) => {
  const [orders] = await pool.query('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', [userId]);
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
  }
  return orders.map(parseOrder);
};

const getOrderById = async (orderId) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
  order.items = items;
  return parseOrder(order);
};

const getAllOrders = async ({ status, userId } = {}) => {
  let sql = `SELECT o.*, u.name as customer_name, u.email as customer_email
             FROM orders o JOIN users u ON u.id = o.user_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status=?'; params.push(status); }
  if (userId) { sql += ' AND o.user_id=?'; params.push(userId); }
  sql += ' ORDER BY o.created_at DESC';
  const [orders] = await pool.query(sql, params);
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
  }
  return orders.map(parseOrder);
};

const updateOrderStatus = async (orderId, status, cancelReason) => {
  if (cancelReason) {
    await pool.query('UPDATE orders SET status=?, cancel_reason=? WHERE id=?', [status, cancelReason, orderId]);
  } else {
    await pool.query('UPDATE orders SET status=? WHERE id=?', [status, orderId]);
  }
};

const updatePaymentStatus = async (orderId, paymentStatus, paymentId) => {
  await pool.query(
    'UPDATE orders SET payment_status=?, payment_id=? WHERE id=?',
    [paymentStatus, paymentId || null, orderId]
  );
};

module.exports = {
  createOrder, getOrdersByUser, getAllOrders, getOrderById, updateOrderStatus, updatePaymentStatus, createOrdersTables,
};
