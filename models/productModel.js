const pool = require('../config/db');
require('dotenv').config();
const CLOUDFRONT_BASE_URL = process.env.CLOUDFRONT_BASE_URL;

const addColIfMissing = async (table, column, definition) => {
const [cols] = await pool.query(
SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?,
[table, column]
);
if (cols.length === 0) {
await pool.query(ALTER TABLE ${table} ADD COLUMN ${column} ${definition});
}
};

const initProductsTable = async () => {
await pool.query(CREATE TABLE IF NOT EXISTS product_templates ( id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL, slug VARCHAR(255) UNIQUE, description TEXT, brand VARCHAR(100), category_id INT NOT NULL, subcategory_id INT DEFAULT NULL, meta_title VARCHAR(255), meta_description TEXT, tags VARCHAR(500), status ENUM('active','inactive') DEFAULT 'active', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP ));

await pool.query(CREATE TABLE IF NOT EXISTS product_skus ( id INT AUTO_INCREMENT PRIMARY KEY, template_id INT NOT NULL, sku_code VARCHAR(100) UNIQUE, price DECIMAL(10,2) NOT NULL DEFAULT 0, discount_price DECIMAL(10,2) DEFAULT NULL, quantity INT DEFAULT 0, weight DECIMAL(10,2), status ENUM('active','inactive') DEFAULT 'active', FOREIGN KEY (template_id) REFERENCES product_templates(id) ON DELETE CASCADE ));

await pool.query(CREATE TABLE IF NOT EXISTS attribute_definitions ( id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, display_type VARCHAR(50) ));

await pool.query(CREATE TABLE IF NOT EXISTS sku_attributes ( sku_id INT NOT NULL, attribute_id INT NOT NULL, attribute_value VARCHAR(255) NOT NULL, PRIMARY KEY (sku_id, attribute_id), FOREIGN KEY (sku_id) REFERENCES product_skus(id) ON DELETE CASCADE, FOREIGN KEY (attribute_id) REFERENCES attribute_definitions(id) ON DELETE CASCADE ));

await pool.query(CREATE TABLE IF NOT EXISTS warehouse_inventory ( id INT AUTO_INCREMENT PRIMARY KEY, sku_id INT NOT NULL, warehouse_id INT, physical_stock INT DEFAULT 0, reserved_stock INT DEFAULT 0, FOREIGN KEY (sku_id) REFERENCES product_skus(id) ON DELETE CASCADE ));

await pool.query(CREATE TABLE IF NOT EXISTS product_images ( id INT AUTO_INCREMENT PRIMARY KEY, product_id INT, sku_id INT, file_path VARCHAR(255) NOT NULL ));

await pool.query(CREATE TABLE IF NOT EXISTS serial_numbers ( id INT AUTO_INCREMENT PRIMARY KEY, product_id INT, sku_id INT, serial VARCHAR(100) UNIQUE, is_used TINYINT(1) DEFAULT 0 ));

try { await pool.query(ALTER TABLE product_templates ADD INDEX idx_status (status)); } catch(e) {}
try { await pool.query(ALTER TABLE product_templates ADD INDEX idx_category (category_id)); } catch(e) {}
try { await pool.query(ALTER TABLE product_skus ADD INDEX idx_sku_code (sku_code)); } catch(e) {}
};

const attachImages = async (rows) => {
for (const product of rows) {
const [imgs] = await pool.query(
'SELECT file_path FROM product_images WHERE product_id = ? OR sku_id = ?',
[product.id, product.sku_id || null]
);
product.images = imgs.map((r) => ${CLOUDFRONT_BASE_URL}/${r.file_path});
}
return rows;
};

const getAllProducts = async () => {
const [rows] = await pool.query(SELECT pt.*, c.name AS category_name, sc.name AS subcategory_name FROM product_templates pt JOIN categories c ON pt.category_id = c.id LEFT JOIN subcategories sc ON pt.subcategory_id = sc.id ORDER BY pt.created_at DESC);
return attachImages(rows);
};

const getActiveProducts = async ({ category_id, subcategory_id, min_price, max_price, search, sort } = {}) => {
let sql = SELECT pt.id, pt.name, pt.slug, pt.brand, pt.description,  ps.price, ps.discount_price, ps.sku_code, c.name AS category_name, pt.created_at FROM product_templates pt JOIN product_skus ps ON pt.id = ps.template_id JOIN categories c ON pt.category_id = c.id WHERE pt.status = 'active' AND ps.status = 'active';
const params = [];
if (category_id) { sql += ' AND pt.category_id = ?'; params.push(category_id); }
if (subcategory_id) { sql += ' AND pt.subcategory_id = ?'; params.push(subcategory_id); }
if (min_price) { sql += ' AND (IFNULL(ps.discount_price, ps.price)) >= ?'; params.push(min_price); }
if (max_price) { sql += ' AND (IFNULL(ps.discount_price, ps.price)) <= ?'; params.push(max_price); }
if (search) {
sql += ' AND (pt.name LIKE ? OR ps.sku_code LIKE ? OR pt.tags LIKE ? OR pt.brand LIKE ?)';
const term = %${search}%;
params.push(term, term, term, term);
}
const sortOptions = {
price_asc: 'IFNULL(ps.discount_price, ps.price) ASC',
price_desc: 'IFNULL(ps.discount_price, ps.price) DESC',
newest: 'pt.created_at DESC',
name_asc: 'pt.name ASC',
};
sql +=  ORDER BY ${sortOptions[sort] || 'pt.created_at DESC'};
const [rows] = await pool.query(sql, params);
return attachImages(rows);
};

const getProductFullDetail = async (skuCode) => {
const [rows] = await pool.query(
SELECT  pt.name as product_name,  pt.description, pt.brand, ps.*,  JSON_OBJECTAGG(ad.name, sa.attribute_value) as specifications, (SELECT SUM(physical_stock - reserved_stock) FROM warehouse_inventory WHERE sku_id = ps.id) as available_qty FROM product_skus ps JOIN product_templates pt ON ps.template_id = pt.id LEFT JOIN sku_attributes sa ON ps.id = sa.sku_id LEFT JOIN attribute_definitions ad ON sa.attribute_id = ad.id WHERE ps.sku_code = ? GROUP BY ps.id,
[skuCode]
);
if (!rows[0]) return null;
const [images] = await pool.query(
'SELECT file_path FROM product_images WHERE sku_id = ? OR product_id = ?',
[rows[0].id, rows[0].template_id]
);
rows[0].images = images.map((r) => ${CLOUDFRONT_BASE_URL}/${r.file_path});
return rows[0];
};

const reserveStock = async (skuId, quantity) => {
const connection = await pool.getConnection();
try {
await connection.beginTransaction();
const [inventory] = await connection.query(
'SELECT id, physical_stock, reserved_stock FROM warehouse_inventory WHERE sku_id = ? AND (physical_stock - reserved_stock) >= ? FOR UPDATE',
[skuId, quantity]
);
if (inventory.length === 0) throw new Error('Insufficient stock');
await connection.query(
'UPDATE warehouse_inventory SET reserved_stock = reserved_stock + ? WHERE id = ?',
[quantity, inventory[0].id]
);
await connection.commit();
return true;
} catch (err) {
await connection.rollback();
throw err;
} finally {
connection.release();
}
};

const createProduct = async (data) => {
const {
name, slug, brand, description,
category_id, subcategory_id,
meta_title, meta_description, tags,
status = 'active',
} = data;
const [result] = await pool.query(
INSERT INTO product_templates (name, slug, brand, description, category_id, subcategory_id, meta_title, meta_description, tags, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
[name, slug || null, brand || null, description || null, category_id, subcategory_id || null, meta_title || null, meta_description || null, tags || null, status]
);
return result.insertId;
};

const updateProduct = async (id, data) => {
const {
name, slug, brand, description,
category_id, subcategory_id,
meta_title, meta_description, tags,
} = data;
await pool.query(
UPDATE product_templates SET name=?, slug=?, brand=?, description=?, category_id=?, subcategory_id=?, meta_title=?, meta_description=?, tags=? WHERE id=?,
[name, slug || null, brand || null, description || null, category_id, subcategory_id || null, meta_title || null, meta_description || null, tags || null, id]
);
};

const updateProductStatus = async (id, status) => {
await pool.query('UPDATE product_templates SET status=? WHERE id=?', [status, id]);
};

const addProductImage = async (productId, skuId, filePath) => {
await pool.query(
'INSERT INTO product_images (product_id, sku_id, file_path) VALUES (?, ?, ?)',
[productId, skuId, filePath]
);
};

const deleteProductImage = async (id, filePath) => {
await pool.query(
'DELETE FROM product_images WHERE (product_id=? OR sku_id=?) AND file_path=?',
[id, id, filePath]
);
};

const addSerialNumber = async (productId, skuId, serial) => {
await pool.query(
'INSERT INTO serial_numbers (product_id, sku_id, serial, is_used) VALUES (?, ?, ?, 0)',
[productId, skuId, serial]
);
};

const deleteProduct = async (id) => {
const [product] = await pool.query('SELECT id, name FROM product_templates WHERE id = ?', [id]);
if (product.length === 0) throw { status: 404, message: 'Product not found' };

const [activeWarranties] = await pool.query(
SELECT COUNT(*) as count FROM warranty_registrations WHERE product_id = ? AND status = 'accepted',
[id]
);
if (activeWarranties[0].count > 0) {
throw {
status: 409,
message: Cannot delete product '${product[0].name}': ${activeWarranties[0].count} active warranty registration(s) exist.,
};
}

const [skus] = await pool.query('SELECT id FROM product_skus WHERE template_id = ?', [id]);
const skuIds = skus.map(s => s.id);

if (skuIds.length > 0) {
await pool.query('DELETE FROM warehouse_inventory WHERE sku_id IN (?)', [skuIds]);
await pool.query('DELETE FROM sku_attributes WHERE sku_id IN (?)', [skuIds]);
await pool.query('DELETE FROM serial_numbers WHERE sku_id IN (?)', [skuIds]);
await pool.query('DELETE FROM product_images WHERE sku_id IN (?)', [skuIds]);
await pool.query('DELETE FROM product_skus WHERE template_id = ?', [id]);
}

await pool.query('DELETE FROM warranty_registrations WHERE product_id = ?', [id]);
await pool.query('DELETE FROM product_images WHERE product_id = ?', [id]);
await pool.query('DELETE FROM product_templates WHERE id = ?', [id]);

return { deleted: true, productName: product[0].name };
};

module.exports = {
initProductsTable,
getAllProducts,
getActiveProducts,
getProductFullDetail,
reserveStock,
createProduct,
updateProduct,
updateProductStatus,
addProductImage,
deleteProductImage,
addSerialNumber,
deleteProduct,
};
