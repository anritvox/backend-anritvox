// backend/models/categoryModel.js
const pool = require("../config/db");

const getAllCategories = async () => {
  const [rows] = await pool.query(
    "SELECT id, name, created_at FROM categories ORDER BY name"
  );
  return rows;
};

const getCategoryById = async (id) => {
  const [rows] = await pool.query(
    "SELECT id, name, created_at FROM categories WHERE id = ?",
    [id]
  );
  return rows[0];
};

const createCategory = async (name) => {
  const [result] = await pool.query(
    "INSERT INTO categories (name) VALUES (?)",
    [name]
  );
  return { id: result.insertId, name };
};

const updateCategory = async (id, name) => {
  await pool.query("UPDATE categories SET name = ? WHERE id = ?", [name, id]);
  return { id, name };
};

const deleteCategory = async (id) => {
  // Check for linked products
  const [products] = await pool.query(
    "SELECT id FROM products WHERE category_id = ? LIMIT 1",
    [id]
  );
  if (products.length > 0) {
    throw {
      status: 409,
      message:
        "Cannot delete: One or more products are still assigned to this category. Please move or delete products first.",
    };
  }
  await pool.query("DELETE FROM categories WHERE id = ?", [id]);
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
