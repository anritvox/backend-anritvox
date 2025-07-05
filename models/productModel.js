const pool = require("../config/db");

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

  // Fetch images for each product
  for (const product of rows) {
    const [imgs] = await pool.query(
      `SELECT file_path FROM product_images WHERE product_id = ?`,
      [product.id]
    );
    product.images = imgs.map((r) => r.file_path);
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
  product.images = images.map((r) => r.file_path);
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
    `INSERT INTO serial_numbers (product_id, serial)
     VALUES (?, ?)`,
    [productId, serial]
  );
};

// Update core product fields
const updateProduct = async (id, data) => {
  const { name, description, price, quantity, category_id, subcategory_id } =
    data;
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
};

// Delete a product (images & serials cascade via FKs)
const deleteProduct = async (id) => {
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
