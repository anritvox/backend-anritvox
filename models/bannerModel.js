// backend/models/bannerModel.js
const pool = require('../config/db');

const createBannerTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS banners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) DEFAULT NULL,
      subtitle VARCHAR(255) DEFAULT NULL,
      image_url TEXT NOT NULL,
      link_url TEXT DEFAULT NULL,
      position ENUM('hero','promo','sidebar','popup') DEFAULT 'hero',
      sort_order INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      starts_at DATETIME DEFAULT NULL,
      ends_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const createBanner = async (data) => {
  const { title, subtitle, image_url, link_url, position, sort_order, starts_at, ends_at } = data;
  const [result] = await pool.query(
    'INSERT INTO banners (title, subtitle, image_url, link_url, position, sort_order, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title || null, subtitle || null, image_url, link_url || null, position || 'hero', sort_order || 0, starts_at || null, ends_at || null]
  );
  return result.insertId;
};

const getActiveBanners = async (position = null) => {
  let query = `SELECT * FROM banners WHERE is_active = 1
    AND (starts_at IS NULL OR starts_at <= NOW())
    AND (ends_at IS NULL OR ends_at >= NOW())`;
  const params = [];
  if (position) { query += ' AND position = ?'; params.push(position); }
  query += ' ORDER BY sort_order ASC, created_at DESC';
  const [rows] = await pool.query(query, params);
  return rows;
};

const getAllBanners = async () => {
  const [rows] = await pool.query('SELECT * FROM banners ORDER BY position, sort_order ASC');
  return rows;
};

const updateBanner = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await pool.query(`UPDATE banners SET ${fields} WHERE id = ?`, values);
};

const deleteBanner = async (id) => {
  await pool.query('DELETE FROM banners WHERE id = ?', [id]);
};

module.exports = { createBannerTable, createBanner, getActiveBanners, getAllBanners, updateBanner, deleteBanner };
