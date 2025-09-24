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

// 🔄 UPDATED: Non-destructive product update (serials managed separately)
const updateProduct = async (id, data) => {
  const {
    name,
    description,
    price,
    category_id,
    subcategory_id,
    // Removed: serials, quantity (now managed by serial system)
  } = data;

  // Only update basic product fields - no serial or quantity changes
  await pool.query(
    `UPDATE products
       SET name = ?, description = ?, price = ?, category_id = ?, subcategory_id = ?
     WHERE id = ?`,
    [name, description, price, category_id, subcategory_id || null, id]
  );

  // Serials are now managed via /api/serials endpoints
  // Quantity will auto-sync with actual serial count
};

// 🔒 UPDATED: Delete a product with warranty protection
const deleteProduct = async (id) => {
  // First, check if the product exists
  const [product] = await pool.query(
    "SELECT id, name FROM products WHERE id = ?",
    [id]
  );

  if (product.length === 0) {
    throw { status: 404, message: "Product not found" };
  }

  // Check for active/accepted warranty registrations
  const [activeWarranties] = await pool.query(
    `SELECT COUNT(*) as count FROM warranty_registrations 
     WHERE product_id = ? AND status = 'accepted'`,
    [id]
  );

  if (activeWarranties[0].count > 0) {
    throw {
      status: 409,
      message: `Cannot delete product '${product[0].name}': ${activeWarranties[0].count} active warranty registration(s) exist. Please reject or handle these warranties first.`,
    };
  }

  // Check for pending warranty registrations (optional warning)
  const [pendingWarranties] = await pool.query(
    `SELECT COUNT(*) as count FROM warranty_registrations 
     WHERE product_id = ? AND status = 'pending'`,
    [id]
  );

  if (pendingWarranties[0].count > 0) {
    console.warn(
      `Warning: Deleting product '${product[0].name}' with ${pendingWarranties[0].count} pending warranty registration(s)`
    );
  }

  // Safe to delete - proceed in proper order
  await pool.query(`DELETE FROM warranty_registrations WHERE product_id = ?`, [
    id,
  ]);
  await pool.query(`DELETE FROM serial_numbers WHERE product_id = ?`, [id]);
  await pool.query(`DELETE FROM product_images WHERE product_id = ?`, [id]);
  await pool.query(`DELETE FROM products WHERE id = ?`, [id]);

  return {
    deleted: true,
    productName: product[0].name,
    message: `Product '${product[0].name}' and all associated data deleted successfully`,
  };
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
