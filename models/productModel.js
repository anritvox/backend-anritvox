const pool = require("../config/db");

require("dotenv").config();
const CLOUDFRONT_BASE_URL = process.env.CLOUDFRONT_BASE_URL;

// List all products with category & subcategory names, including an images array
const getAllProducts = async () => {
  const [rows] = await pool.query(
    `SELECT 
       p.id, 
       p.name, 
       p.description, 
       p.price, 
       p.quantity, 
       c.id   AS category_id, 
       c.name AS category_name,
       sc.id  AS subcategory_id, 
       sc.name AS subcategory_name,
       p.created_at
     FROM products p
     JOIN categories c ON p.category_id = c.id
     LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
     ORDER BY p.created_at DESC`
  );

  for (const product of rows) {
    const [imgs] = await pool.query(
      `SELECT file_path FROM product_images WHERE product_id = ?`,
      [product.id]
    );

    // 🔁 OLD: direct path (not CDN)
    // product.images = imgs.map((r) => r.file_path);

    // ✅ NEW: use CloudFront CDN
    product.images = imgs.map((r) => `${CLOUDFRONT_BASE_URL}/${r.file_path}`);
  }

  return rows;
};

// Get one product plus its images
const getProductById = async (id) => {
  const [[product]] = await pool.query(
    `SELECT 
       id, name, description, price, quantity, 
       category_id, subcategory_id, created_at
     FROM products
     WHERE id = ?`,
    [id]
  );

  if (!product) return null;

  const [images] = await pool.query(
    `SELECT file_path FROM product_images WHERE product_id = ?`,
    [id]
  );

  // 🔁 OLD:
  // product.images = images.map((r) => r.file_path);

  // ✅ NEW:
  product.images = images.map((r) => `${CLOUDFRONT_BASE_URL}/${r.file_path}`);

  return product;
};

// Create product (core fields)
const createProduct = async (data) => {
  const { name, description, price, quantity, category_id, subcategory_id } =
    data;

  const [result] = await pool.query(
    `INSERT INTO products
       (name, description, price, quantity, category_id, subcategory_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, description, price, quantity, category_id, subcategory_id || null]
  );

  return result.insertId;
};

// Insert image record
const addProductImage = async (productId, filePath) => {
  await pool.query(
    `INSERT INTO product_images (product_id, file_path)
     VALUES (?, ?)`,
    [productId, filePath]
  );
};

// Insert serial number
const addSerialNumber = async (productId, serial) => {
  await pool.query(
    `INSERT INTO serial_numbers (product_id, serial, is_used)
     VALUES (?, ?, 0)`,
    [productId, serial]
  );
};

// Update core product fields and optionally replace serials
const updateProduct = async (id, data) => {
  const {
    name,
    description,
    price,
    quantity,
    category_id,
    subcategory_id,
    serials,
  } = data;

  await pool.query(
    `UPDATE products
       SET name = ?, description = ?, price = ?, quantity = ?, category_id = ?, subcategory_id = ?
     WHERE id = ?`,
    [
      name,
      description,
      price,
      quantity,
      category_id,
      subcategory_id || null,
      id,
    ]
  );

  // If serials array provided, reset all serials & warranty
  if (Array.isArray(serials)) {
    await pool.query(
      `DELETE FROM warranty_registrations WHERE product_id = ?`,
      [id]
    );

    await pool.query(`DELETE FROM serial_numbers WHERE product_id = ?`, [id]);

    if (serials.length) {
      const values = serials.map((s) => [id, s.trim().toUpperCase(), 0]);
      await pool.query(
        `INSERT INTO serial_numbers (product_id, serial, is_used) VALUES ?`,
        [values]
      );
    }
  }
};

// Delete a product and all associated data
const deleteProduct = async (id) => {
  await pool.query(`DELETE FROM warranty_registrations WHERE product_id = ?`, [
    id,
  ]);
  await pool.query(`DELETE FROM serial_numbers WHERE product_id = ?`, [id]);
  await pool.query(`DELETE FROM product_images WHERE product_id = ?`, [id]);
  await pool.query(`DELETE FROM products WHERE id = ?`, [id]);
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  addProductImage,
  addSerialNumber,
  updateProduct,
  deleteProduct,
};
