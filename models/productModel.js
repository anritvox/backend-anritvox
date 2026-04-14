const pool = require('../config/db');

require('dotenv').config();

const CLOUDFRONT_BASE_URL = process.env.CLOUDFRONT_BASE_URL;

const addColIfMissing = async (table, column, definition) => {
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    if (cols.length === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[DB] Added column ${column} to ${table}`);
    }
  } catch (err) {
    console.error(`[DB] Error adding column ${column} to ${table}:`, err.message);
  }
};

const initProductsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE,
      sku VARCHAR(100) UNIQUE,
      brand VARCHAR(100),
      warranty_period VARCHAR(100),
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      discount_price DECIMAL(10,2),
      quantity INT DEFAULT 0,
      status ENUM('active', 'inactive') DEFAULT 'active',
      category_id INT,
      subcategory_id INT,
      meta_title VARCHAR(255),
      meta_description TEXT,
      tags VARCHAR(500),
      video_urls TEXT,
      product_links TEXT,
      model_3d_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT,
      file_path VARCHAR(500) NOT NULL,
      media_type ENUM('image','video','3d') DEFAULT 'image',
      sort_order INT DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Existing additions
  await addColIfMissing('products', 'warranty_period', 'VARCHAR(100) DEFAULT NULL AFTER brand');
  await addColIfMissing('products', 'slug', 'VARCHAR(255) AFTER name');
  await addColIfMissing('products', 'sku', 'VARCHAR(100) AFTER slug');
  await addColIfMissing('products', 'brand', 'VARCHAR(100) AFTER sku');
  await addColIfMissing('products', 'discount_price', 'DECIMAL(10,2) DEFAULT NULL AFTER price');
  await addColIfMissing('products', 'status', "ENUM('active','inactive') DEFAULT 'active' AFTER quantity");
  await addColIfMissing('products', 'meta_title', 'VARCHAR(255) AFTER subcategory_id');
  await addColIfMissing('products', 'meta_description', 'TEXT AFTER meta_title');
  await addColIfMissing('products', 'tags', 'VARCHAR(500) AFTER meta_description');
  
  // NEW REDESIGN COLUMNS
  await addColIfMissing('products', 'video_urls', 'TEXT DEFAULT NULL');
  await addColIfMissing('products', 'product_links', 'TEXT DEFAULT NULL');
  await addColIfMissing('products', 'model_3d_url', 'VARCHAR(500) DEFAULT NULL');

  // NEW MEDIA TYPE FOR IMAGES
  await addColIfMissing('product_images', 'media_type', "ENUM('image','video','3d') DEFAULT 'image'");
  await addColIfMissing('product_images', 'sort_order', "INT DEFAULT 0");

  try { await pool.query('ALTER TABLE products ADD UNIQUE INDEX idx_slug (slug)'); } catch(e) {}
  try { await pool.query('ALTER TABLE products ADD INDEX idx_status (status)'); } catch(e) {}
  try { await pool.query('ALTER TABLE products ADD INDEX idx_category (category_id)'); } catch(e) {}
};

const attachImages = async (rows) => {
  for (const product of rows) {
    const [imgs] = await pool.query(
      'SELECT file_path, media_type, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
      [product.id]
    );
    product.images = imgs.map((r) => ({
      url: r.file_path.startsWith('http') ? r.file_path : `${CLOUDFRONT_BASE_URL}/${r.file_path}`,
      type: r.media_type || 'image'
    }));
  }
  return rows;
};

const getAllProducts = async () => {
  const [rows] = await pool.query(`
    SELECT p.*, c.name AS category_name, sc.name AS subcategory_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
    ORDER BY p.created_at DESC
  `); // p.* now includes video_urls, product_links, and model_3d_url
  return attachImages(rows);
};

const getActiveProducts = async ({ category_id, subcategory_id, min_price, max_price, search, sort } = {}) => {
  let sql = `
    SELECT p.*, c.name AS category_name, sc.name AS subcategory_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN subcategories sc ON p.subcategory_id = sc.id
    WHERE p.status = 'active'
  `; // p.* ensures new fields are pulled for the shop/home pages
  const params = [];

  if (category_id) { sql += ' AND p.category_id = ?'; params.push(category_id); }
  if (subcategory_id) { sql += ' AND p.subcategory_id = ?'; params.push(subcategory_id); }
  if (min_price) { sql += ' AND (IFNULL(p.discount_price, p.price)) >= ?'; params.push(min_price); }
  if (max_price) { sql += ' AND (IFNULL(p.discount_price, p.price)) <= ?'; params.push(max_price); }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.tags LIKE ? OR p.brand LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }
  
  const sortOptions = {
    price_asc: 'IFNULL(p.discount_price, p.price) ASC',
    price_desc: 'IFNULL(p.discount_price, p.price) DESC',
    newest: 'p.created_at DESC',
    name_asc: 'p.name ASC',
  };
  sql += ` ORDER BY ${sortOptions[sort] || 'p.created_at DESC'}`;
  
  const [rows] = await pool.query(sql, params);
  return attachImages(rows);
};

// ... update getProductById to ensure it also uses p.* if not already ...
const getProductById = async (id) => {
  const [[product]] = await pool.query(
    'SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?',
    [id]
  );
  if (!product) return null;
  
  const [images] = await pool.query(
    'SELECT file_path, media_type, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
    [id]
  );
  
  product.images = images.map((r) => ({
    url: r.file_path.startsWith('http') ? r.file_path : `${process.env.CLOUDFRONT_BASE_URL}/${r.file_path}`,
    type: r.media_type || 'image'
  }));
  
  return product;
};

const getProductBySlug = async (slug) => {
  const [[product]] = await pool.query(
    'SELECT id FROM products WHERE slug = ? AND status = "active"',
    [slug]
  );
  if (!product) return null;
  return getProductById(product.id);
};

const createProduct = async (data) => {
  const {
    name, slug, sku, brand, warranty_period, description,
    price, discount_price, quantity,
    category_id, subcategory_id,
    meta_title, meta_description, tags,
    video_urls, product_links, model_3d_url,
    status = 'active',
  } = data;
  
  const [result] = await pool.query(
    `INSERT INTO products 
    (name, slug, sku, brand, warranty_period, description, price, discount_price, quantity, status, category_id, subcategory_id, meta_title, meta_description, tags, video_urls, product_links, model_3d_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, slug || null, sku || null, brand || null, warranty_period || null, description || null,
     price, discount_price || null, quantity || 0, status,
     category_id, subcategory_id || null,
     meta_title || null, meta_description || null, tags || null,
     video_urls || null, product_links || null, model_3d_url || null]
  );
  return result.insertId;
};

const updateProduct = async (id, data) => {
  const {
    name, slug, sku, brand, warranty_period, description,
    price, discount_price, 
    category_id, subcategory_id,
    meta_title, meta_description, tags,
    video_urls, product_links, model_3d_url,
  } = data;

  await pool.query(
    `UPDATE products SET 
    name=?, slug=?, sku=?, brand=?, warranty_period=?, description=?,
    price=?, discount_price=?, 
    category_id=?, subcategory_id=?,
    meta_title=?, meta_description=?, tags=?,
    video_urls=?, product_links=?, model_3d_url=?
    WHERE id=?`,
    [name, slug || null, sku || null, brand || null, warranty_period || null, description || null,
     price, discount_price || null, 
     category_id, subcategory_id || null,
     meta_title || null, meta_description || null, tags || null,
     video_urls || null, product_links || null, model_3d_url || null, id]
  );
};

const updateProductStatus = async (id, status) => {
  await pool.query('UPDATE products SET status=? WHERE id=?', [status, id]);
};

const addProductImage = async (productId, filePath, mediaType = 'image') => {
  await pool.query(
    'INSERT INTO product_images (product_id, file_path, media_type) VALUES (?, ?, ?)',
    [productId, filePath, mediaType]
  );
};

const deleteProductImage = async (imageId) => {
  await pool.query('DELETE FROM product_images WHERE id = ?', [imageId]);
};

const deleteProduct = async (id) => {
  const [product] = await pool.query('SELECT name FROM products WHERE id = ?', [id]);
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

  await pool.query('DELETE FROM product_images WHERE product_id = ?', [id]);
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
  return { deleted: true, productName: product[0].name };
};

const updateProductStock = async (id, quantityChange, operation = 'set') => {
  let query = '';
  if (operation === 'set') {
    query = 'UPDATE products SET quantity = ? WHERE id = ?';
  } else if (operation === 'add') {
    query = 'UPDATE products SET quantity = quantity + ? WHERE id = ?';
  } else if (operation === 'subtract') {
    query = 'UPDATE products SET quantity = GREATEST(0, quantity - ?) WHERE id = ?';
  }

  await pool.query(query, [quantityChange, id]);
  const [[updatedProduct]] = await pool.query('SELECT quantity FROM products WHERE id = ?', [id]);
  return updatedProduct.quantity;
};

module.exports = {
  initProductsTable,
  getAllProducts,
  getActiveProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  updateProductStatus,
  addProductImage,
  deleteProductImage,
  deleteProduct,
  updateProductStock
};
