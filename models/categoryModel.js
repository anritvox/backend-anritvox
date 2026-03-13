// backend/models/categoryModel.js
const pool = require('../config/db');

// Non-destructive init: add new columns if missing
const initCategoriesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      image_url VARCHAR(500),
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const addCols = [
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT AFTER name",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url VARCHAR(500) AFTER description",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER image_url",
  ];
  for (const sql of addCols) { await pool.query(sql).catch(() => {}); }
};
initCategoriesTable().catch(console.error);

const getAllCategories = async () => {
  const [rows] = await pool.query(
    'SELECT id, name, description, image_url, is_active, created_at FROM categories ORDER BY name'
  );
  return rows;
};

const getCategoryById = async (id) => {
  const [rows] = await pool.query(
    'SELECT id, name, description, image_url, is_active, created_at FROM categories WHERE id = ?',
    [id]
  );
  return rows[0];
};

const createCategory = async ({ name, description, image_url }) => {
  const [result] = await pool.query(
    'INSERT INTO categories (name, description, image_url) VALUES (?, ?, ?)',
    [name, description || null, image_url || null]
  );
  return { id: result.insertId, name, description, image_url };
};

const updateCategory = async (id, { name, description, image_url }) => {
  await pool.query(
    'UPDATE categories SET name=?, description=?, image_url=? WHERE id=?',
    [name, description || null, image_url || null, id]
  );
  return { id, name, description, image_url };
};

const deleteCategory = async (id) => {
  const [products] = await pool.query(
    'SELECT id FROM products WHERE category_id = ? LIMIT 1', [id]
  );
  if (products.length > 0) {
    throw {
      status: 409,
      message: 'Cannot delete: one or more products are still assigned to this category. Move or delete products first.',
    };
  }
  await pool.query('DELETE FROM categories WHERE id = ?', [id]);
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
