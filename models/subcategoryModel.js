// backend/models/subcategoryModel.js
const pool = require("../config/db");

// Fetch all subcategories, including their parent category name
const getAllSubcategories = async () => {
  const [rows] = await pool.query(
    `SELECT sc.id, sc.name, sc.category_id, c.name AS category_name, sc.created_at
     FROM subcategories sc
     JOIN categories c ON sc.category_id = c.id
     ORDER BY c.name, sc.name`
  );
  return rows;
};

// Fetch a single subcategory by ID
const getSubcategoryById = async (id) => {
  const [rows] = await pool.query(
    `SELECT id, name, category_id, created_at
     FROM subcategories
     WHERE id = ?`,
    [id]
  );
  return rows[0];
};

// Create a new subcategory under a given category
const createSubcategory = async (name, categoryId) => {
  const [result] = await pool.query(
    `INSERT INTO subcategories (name, category_id)
     VALUES (?, ?)`,
    [name, categoryId]
  );
  return { id: result.insertId, name, category_id: categoryId };
};

// Update a subcategory’s name or parent category
const updateSubcategory = async (id, name, categoryId) => {
  await pool.query(
    `UPDATE subcategories
     SET name = ?, category_id = ?
     WHERE id = ?`,
    [name, categoryId, id]
  );
  return { id, name, category_id: categoryId };
};

// Delete a subcategory by ID
const deleteSubcategory = async (id) => {
  await pool.query(`DELETE FROM subcategories WHERE id = ?`, [id]);
};

module.exports = {
  getAllSubcategories,
  getSubcategoryById,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
};
