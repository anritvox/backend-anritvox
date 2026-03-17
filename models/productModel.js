// backend/models/productModel.js
const pool = require('../config/db');
require('dotenv').config();
const CLOUDFRONT_BASE_URL = process.env.CLOUDFRONT_BASE_URL;

// Helper: add column if it doesn't exist (MySQL 5.7 compatible)
const addColIfMissing = async (table, column, definition) => {
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = ?
     AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (cols.length === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};

// Auto-create/alter products table with all e-commerce fields
const initProductsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255),
      description TEXT,
      sku VARCHAR(100),
      brand VARCHAR(100),
      price DECIMAL(10,2) NOT NULL DEFAULT 0,
      discount_price DECIMAL(10,2) DEFAULT NULL,
      quantity INT DEFAULT 0,
      status ENUM('active','inactive') DEFAULT 'active',
      category_id INT NOT NULL,
      subcategory_id INT DEFAULT NULL,
      meta_title VARCHAR(255),
      meta_description TEXT,
      tags VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  
  // Add new columns to existing table if missing (MySQL 5.7 compatible)
  await addColIfMissing('products', 'warranty_period', 'VARCHAR(100) DEFAULT NULL AFTER brand');
  await addColIfMissing('products', 'slug', 'VARCHAR(255) AFTER name');
  await addColIfMissing('products', 'sku', 'VARCHAR(100) AFTER slug');
  await addColIfMissing('products', 'brand', 'VARCHAR(100) AFTER sku');
  await addColIfMissing('products', 'discount_price', 'DECIMAL(10,2) DEFAULT NULL AFTER price');
  await addColIfMissing('products', 'status', "ENUM('active','inactive') DEFAULT 'active' AFTER quantity");
  await addColIfMissing('products', 'meta_title', 'VARCHAR(255) AFTER subcategory_id');
  await addColIfMissing('products', 'meta_description', 'TEXT AFTER meta_title');
  await addColIfMissing('products', 'tags', 'VARCHAR(500) AFTER meta_description');
};
initProductsTable().catch(console.error);

// ─── HELPERS ─────────────────────────────────────────────────────────
const attachImages = async (rows) => {
  for (const product of rows) {
    const [imgs] = await pool.query(
      'SELECT file_path FROM product_images WHERE product_id = ?',
      [product.id]
    );
    product.images = imgs.map((r) => `${CLOUDFRONT_BASE_URL}/${r.file_path}`);
  }
  return rows;
};

// ─── QUERIES ─────────────────────────────────────────────────────────
// List all products (admin - includes inactive)
const getAllProducts = async () => {
  const [rows] = await pool.query(`
    SELECT p.id, p.name, p.slug, p.sku, p.brand, p.description,
      p.price, p.discount_price, p.quantity, p.status, p.tags,
      p.meta_title, p.meta_description,
      c.id AS category_id, c.name AS category_name,
      sc.id AS subcategory_id, sc.name AS subcategory_name,
      p.created_at, p.updated_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
    ORDER BY p.created_at DESC
  `);
  return attachImages(rows);
};

// List active products only (customer-facing) with optional filters
const getActiveProducts = async ({ category_id, subcategory_id, min_price, max_price, search, sort } = {}) => {
  let sql = `
    SELECT p.id, p.name, p.slug, p.sku, p.brand, p.description,
      p.price, p.discount_price, p.quantity, p.status, p.tags,
      c.id AS category_id, c.name AS category_name,
      sc.id AS subcategory_id, sc.name AS subcategory_name,
      p.created_at
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
    WHERE p.status = 'active'
  `;
  const params = [];
  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (subcategory_id) { sql += ' AND p.subcategory_id = ?'; params.push(subcategory_id); }
  if (min_price) { sql += ' AND p.price >= ?'; params.push(min_price); }
  if (max_price) { sql += ' AND p.price <= ?'; params.push(max_price); }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.tags LIKE ? OR p.brand LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  const sortOptions = {
    price_asc: 'p.price ASC',
    price_desc: 'p.price DESC',
    newest: 'p.created_at DESC',
    name_asc: 'p.name ASC',
  };
  sql += ` ORDER BY ${sortOptions[sort] || 'p.created_at DESC'}`;
  const [rows] = await pool.query(sql, params);
  return attachImages(rows);
};

// Get one product by ID (with images)
const getProductById = async (id) => {
  const [[product]] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.sku, p.brand, p.description,
      p.price, p.discount_price, p.quantity, p.status, p.tags,
      p.meta_title, p.meta_description,
      p.category_id, p.subcategory_id, p.created_at, p.updated_at
     FROM products p WHERE p.id = ?`,
    [id]
  );
  if (!product) return null;
  const [images] = await pool.query(
    'SELECT file_path FROM product_images WHERE product_id = ?',
    [id]
  );
  product.images = images.map((r) => `${CLOUDFRONT_BASE_URL}/${r.file_path}`);
  return product;
};

// Get product by slug (customer-facing)
const getProductBySlug = async (slug) => {
  const [[product]] = await pool.query(
    `SELECT p.id, p.name, p.slug, p.sku, p.brand, p.description,
      p.price, p.discount_price, p.quantity, p.status, p.tags,
      p.meta_title, p.meta_description,
      c.id AS category_id, c.name AS category_name,
      sc.id AS subcategory_id, sc.name AS subcategory_name,
      p.created_at
     FROM products p
     JOIN categories c ON p.category_id = c.id
     LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
     WHERE p.slug = ? AND p.status = 'active'`,
    [slug]
  );
  if (!product) return null;
  const [images] = await pool.query(
    'SELECT file_path FROM product_images WHERE product_id = ?',
    [product.id]
  );
  product.images = images.map((r) => `${CLOUDFRONT_BASE_URL}/${r.file_path}`);
  return product;
};

// Create product
const createProduct = async (data) => {
  const {
    name, slug, sku, brand, description,
    price, discount_price, quantity,
    category_id, subcategory_id,
    meta_title, meta_description, tags,
    status = 'active',
  } = data;
  const [result] = await pool.query(
    `INSERT INTO products
     (name, slug, sku, brand, description, price, discount_price, quantity, status, category_id, subcategory_id, meta_title, meta_description, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, slug || null, sku || null, brand || null, description || null,
     price, discount_price || null, quantity || 0, status,
     category_id, subcategory_id || null,
     meta_title || null, meta_description || null, tags || null]
  );
  return result.insertId;
};

// Update product (non-destructive)
const updateProduct = async (id, data) => {
  const {
    name, slug, sku, brand, description,
    price, discount_price,
    category_id, subcategory_id,
    meta_title, meta_description, tags,
  } = data;
  await pool.query(
    `UPDATE products SET
     name=?, slug=?, sku=?, brand=?, description=?,
     price=?, discount_price=?,
     category_id=?, subcategory_id=?,
     meta_title=?, meta_description=?, tags=?
     WHERE id=?`,
    [name, slug || null, sku || null, brand || null, description || null,
     price, discount_price || null,
     category_id, subcategory_id || null,
     meta_title || null, meta_description || null, tags || null, id]
  );
};

// Toggle product status (publish/unpublish)
const updateProductStatus = async (id, status) => {
  await pool.query('UPDATE products SET status=? WHERE id=?', [status, id]);
};

// Add image record
const addProductImage = async (productId, filePath) => {
  await pool.query(
    'INSERT INTO product_images (product_id, file_path) VALUES (?, ?)',
    [productId, filePath]
  );
};

// Delete image record
const deleteProductImage = async (productId, filePath) => {
  await pool.query(
    'DELETE FROM product_images WHERE product_id=? AND file_path=?',
    [productId, filePath]
  );
};

// Add serial number
const addSerialNumber = async (productId, serial) => {
  await pool.query(
    'INSERT INTO serial_numbers (product_id, serial, is_used) VALUES (?, ?, 0)',
    [productId, serial]
  );
};

// Delete product with warranty protection
const deleteProduct = async (id) => {
  const [product] = await pool.query('SELECT id, name FROM products WHERE id = ?', [id]);
  if (product.length === 0) throw { status: 404, message: 'Product not found' };
  const [activeWarranties] = await pool.query(
    `SELECT COUNT(*) as count FROM warranty_registrations WHERE product_id = ? AND status = 'accepted'`,
    [id]
  );
  if (activeWarranties[0].count > 0) {
    throw {
      status: 409,
      message: `Cannot delete product '${product[0].name}': ${activeWarranties[0].count} active warranty registration(s) exist.`,
    };
  }
  await pool.query('DELETE FROM warranty_registrations WHERE product_id = ?', [id]);
  await pool.query('DELETE FROM serial_numbers WHERE product_id = ?', [id]);
  await pool.query('DELETE FROM product_images WHERE product_id = ?', [id]);
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
  return { deleted: true, productName: product[0].name };
};

module.exports = {
  getAllProducts,
  getActiveProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  updateProductStatus,
  addProductImage,
  deleteProductImage,
  addSerialNumber,
  deleteProduct,
};
