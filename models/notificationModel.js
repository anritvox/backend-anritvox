// backend/models/notificationMode

const pool = require('../config/db');

const createNotificationTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('order','promo','system','alert') DEFAULT 'system',
      is_read TINYINT(1) DEFAULT 0,
      is_global TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

// Admin: create notification for specific user or all users (global)
const createNotification = async (data) => {
  const { user_id, title, message, type, is_global } = data;
  const [result] = await pool.query(
    'INSERT INTO notifications (user_id, title, message, type, is_global) VALUES (?, ?, ?, ?, ?)',
    [user_id || null, title, message, type || 'system', is_global ? 1 : 0]
  );
  return result.insertId;
};

// Get notifications for a user (own + global)
const getNotificationsForUser = async (userId) => {
  const [rows] = await pool.query(
    `SELECT * FROM notifications
     WHERE (user_id = ? OR is_global = 1)
     ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
};

// Mark notification(s) as read
const markAsRead = async (userId, notifId = null) => {
  if (notifId) {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [notifId, userId]);
  } else {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
  }
};

// Count unread for user
const countUnread = async (userId) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) as count FROM notifications WHERE (user_id = ? OR is_global = 1) AND is_read = 0`,
    [userId]
  );
  return rows[0].count;
};

// Admin: get all notifications
const getAllNotifications = async () => {
  const [rows] = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
  return rows;
};

// Admin: delete notification
const deleteNotification = async (id) => {
  await pool.query('DELETE FROM notifications WHERE id = ?', [id]);
};

module.exports = { createNotificationTable, createNotification, getNotificationsForUser, markAsRead, countUnread, getAllNotifications, deleteNotification };
