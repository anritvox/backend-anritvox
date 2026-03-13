// backend/models/returnModel.js
const pool = require('../config/db');

const createReturnTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS returns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      user_id INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      description TEXT DEFAULT NULL,
      status ENUM('requested','approved','rejected','received','refunded') DEFAULT 'requested',
      refund_amount DECIMAL(10,2) DEFAULT NULL,
      refund_type ENUM('original','store_credit','bank') DEFAULT 'original',
      admin_notes TEXT DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS return_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      return_id INT NOT NULL,
      order_item_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL DEFAULT 1,
      reason VARCHAR(255) DEFAULT NULL,
      FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE
    )
  `);
};

const createReturn = async (data) => {
  const { order_id, user_id, reason, description, refund_type, items } = data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO returns (order_id, user_id, reason, description, refund_type) VALUES (?, ?, ?, ?, ?)',
      [order_id, user_id, reason, description || null, refund_type || 'original']
    );
    const returnId = result.insertId;
    if (items && items.length) {
      for (const item of items) {
        await conn.query(
          'INSERT INTO return_items (return_id, order_item_id, product_id, quantity, reason) VALUES (?, ?, ?, ?, ?)',
          [returnId, item.order_item_id, item.product_id, item.quantity || 1, item.reason || null]
        );
      }
    }
    await conn.commit();
    return returnId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const getReturnsByUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT r.*, o.order_number FROM returns r
     JOIN orders o ON r.order_id = o.id
     WHERE r.user_id = ? ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows;
};

const getReturnById = async (id) => {
  const [[ret]] = await pool.query(
    `SELECT r.*, o.order_number, u.name as user_name, u.email FROM returns r
     JOIN orders o ON r.order_id = o.id
     JOIN users u ON r.user_id = u.id
     WHERE r.id = ?`,
    [id]
  );
  if (!ret) return null;
  const [items] = await pool.query(
    `SELECT ri.*, p.name as product_name FROM return_items ri
     JOIN products p ON ri.product_id = p.id
     WHERE ri.return_id = ?`,
    [id]
  );
  ret.items = items;
  return ret;
};

const getAllReturns = async (status = null) => {
  let query = `SELECT r.*, o.order_number, u.name as user_name, u.email
               FROM returns r JOIN orders o ON r.order_id = o.id
               JOIN users u ON r.user_id = u.id`;
  const params = [];
  if (status) { query += ' WHERE r.status = ?'; params.push(status); }
  query += ' ORDER BY r.created_at DESC';
  const [rows] = await pool.query(query, params);
  return rows;
};

const updateReturnStatus = async (id, status, adminNotes = null, refundAmount = null) => {
  await pool.query(
    'UPDATE returns SET status = ?, admin_notes = ?, refund_amount = ? WHERE id = ?',
    [status, adminNotes, refundAmount, id]
  );
};

module.exports = { createReturnTable, createReturn, getReturnsByUser, getReturnById, getAllReturns, updateReturnStatus };
