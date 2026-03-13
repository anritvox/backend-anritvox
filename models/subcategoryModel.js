// backend/models/subcategoryModel.js
const pool = require('../config/db');

// Non-destructive: add description column if missing
const initSubcategoriesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      category_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    "ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS description TEXT AFTER name"
  ).catch(() => {});
};
initSubcategoriesTable().catch(console.error);

// All subcategories with parent category name
const getAllSubcategories = async () => {
  const [rows] = await pool.query(`
    SELECT sc.id, sc.name, sc.description, sc.category_id,
      c.name AS category_name, sc.created_at
    FROM subcategories sc
    JOIN categories c ON sc.category_id = c.id
    ORDER BY c.name, sc.name
  `);
  return rows;
};

// Subcategories filtered by category
const getSubcategoriesByCategory = async (categoryId) => {
  const [rows] = await pool.query(
    `SELECT sc.id, sc.name, sc.description, sc.category_id,
      c.name AS category_name, sc.created_at
     FROM subcategories sc
     JOIN categories c ON sc.category_id = c.id
     WHERE sc.category_id = ?
     ORDER BY sc.name`,
    [categoryId]
  );
  return rows;
};

// Single subcategory by ID
const getSubcategoryById = async (id) => {
  const [rows] = await pool.query(
    `SELECT sc.id, sc.name, sc.description, sc.category_id,
      c.name AS category_name, sc.created_at
     FROM subcategories sc
     JOIN categories c ON sc.category_id = c.id
     WHERE sc.id = ?`,
    [id]
  );
  return rows[0];
};

// Create subcategory
const createSubcategory = async ({ name, category_id, description }) => {
  const [result] = await pool.query(
    'INSERT INTO subcategories (name, description, category_id) VALUES (?, ?, ?)',
    [name, description || null, category_id]
  );
  return { id: result.insertId, name, description, category_id };
};

// Update subcategory
const updateSubcategory = async (id, { name, category_id, description }) => {
  await pool.query(
    'UPDATE subcategories SET name=?, description=?, category_id=? WHERE id=?',
    [name, description || null, category_id, id]
  );
  return { id, name, description, category_id };
};

// Delete subcategory
const deleteSubcategory = async (id) => {
  const [products] = await pool.query(
    'SELECT id FROM products WHERE subcategory_id = ? LIMIT 1', [id]
  );
  if (products.length > 0) {
    throw {
      status: 409,
      message: 'Cannot delete: products are still assigned to this subcategory.',
    };
  }
  await pool.query('DELETE FROM subcategories WHERE id = ?', [id]);
};

module.exports = {
  getAllSubcategories,
  getSubcategoriesByCategory,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
};
