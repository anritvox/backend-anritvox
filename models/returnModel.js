const db = require('../config/db');

const ReturnModel = {
  createReturnRequest: async (returnRequest) => {
    // Upgraded to include product_id and rma_number
    const { order_id, user_id, product_id, reason, details, image_urls, rma_number } = returnRequest;
    const [result] = await db.execute(
      `INSERT INTO returns (order_id, user_id, product_id, reason, details, image_urls, rma_number, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [order_id, user_id, product_id, reason, details, JSON.stringify(image_urls || []), rma_number]
    );
    return result.insertId;
  },

  getReturnsByUser: async (userId) => {
    // Upgraded to pull product name/slug for the frontend UI
    const [rows] = await db.execute(
      `SELECT r.*, o.id as order_number, p.name as product_name, p.slug 
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       JOIN products p ON r.product_id = p.id
       WHERE r.user_id = ? ORDER BY r.created_at DESC`,
      [userId]
    );
    return rows;
  },

  getAllReturns: async () => {
    const [rows] = await db.execute(
      `SELECT r.*, u.email as user_email, o.id as order_number, p.name as product_name 
       FROM returns r
       LEFT JOIN users u ON r.user_id = u.id
       JOIN orders o ON r.order_id = o.id
       JOIN products p ON r.product_id = p.id
       ORDER BY r.created_at DESC`
    );
    return rows;
  },

  updateReturnStatus: async (id, status, adminNotes = null) => {
    const [result] = await db.execute(
      `UPDATE returns SET status = ?, admin_notes = ? WHERE id = ?`,
      [status, adminNotes, id]
    );
    return result.affectedRows > 0;
  }
};

module.exports = ReturnModel;
