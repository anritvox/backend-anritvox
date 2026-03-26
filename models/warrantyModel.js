// backend/models/warrantyModel.js
const pool = require("../config/db");
require('dotenv').config();
const CLOUDFRONT_BASE_URL = process.env.CLOUDFRONT_BASE_URL || "";

// Bulletproof Table Initialization & Dynamic Schema Patcher
const initWarrantyTable = async () => {
  // 1. Create base table if it doesn't exist at all
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warranty_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      registered_serial VARCHAR(255) NOT NULL,
      product_id INT NOT NULL,
      status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Safely patch missing columns (Fixes the ER_BAD_FIELD_ERROR crash)
  const addCol = async (table, sql) => {
    try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${sql}`); } catch (e) {}
  };

  await addCol('warranty_registrations', 'user_name VARCHAR(255) AFTER product_id');
  await addCol('warranty_registrations', 'user_email VARCHAR(255) AFTER user_name');
  await addCol('warranty_registrations', 'user_phone VARCHAR(50) AFTER user_email');
  await addCol('warranty_registrations', 'purchase_date DATE AFTER user_phone');
  await addCol('warranty_registrations', 'invoice_number VARCHAR(100) AFTER purchase_date');
};

const validateSerial = async (serial) => {
  if (!serial) throw { status: 400, message: "Serial number is missing." };
  
  const s = String(serial).trim().toUpperCase();
  
  const [rows] = await pool.query(
    `SELECT ps.id AS serial_id, ps.product_id, ps.serial_number, ps.status, 
            p.name AS product_name, p.brand, p.warranty_period,
            c.id AS category_id, c.name AS category_name
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE ps.serial_number = ?`,
    [s]
  );
  
  if (rows.length === 0) throw { status: 404, message: "Serial number not found in our database." };
  
  const rec = rows[0];

  const [imageRows] = await pool.query(
    'SELECT file_path FROM product_images WHERE product_id = ?',
    [rec.product_id]
  );

  rec.images = imageRows.map((img) => `${CLOUDFRONT_BASE_URL}/${img.file_path}`);
    
  return rec;
};

const registerWarranty = async (data) => {
  // Ensure table and all new columns exist before inserting
  await initWarrantyTable(); 

  const { serialNumber, serial, productId, customerName, email, phone, purchaseDate, invoiceNumber } = data;
  const targetSerial = serialNumber || serial;
  
  if (!targetSerial) throw { status: 400, message: "Serial number is required." };
  if (!productId) throw { status: 400, message: "Product ID is required." };

  const rec = await validateSerial(targetSerial);
  
  if (Number(rec.product_id) !== Number(productId)) {
      throw { status: 400, message: "Product mismatch for given serial number." };
  }

  if (rec.status === 'registered' || rec.status === 'sold') {
    throw { status: 400, message: "This serial number is already registered for warranty." };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO warranty_registrations 
        (registered_serial, product_id, user_name, user_email, user_phone, purchase_date, invoice_number, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted')`,
      [rec.serial_number, productId, customerName || null, email || null, phone || null, purchaseDate || null, invoiceNumber || null]
    );
    await conn.query(`UPDATE product_serials SET status = 'registered' WHERE serial_number = ?`, [rec.serial_number]);
    await conn.commit();
    return { registration_id: result.insertId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const getAllRegistrations = async () => {
  await initWarrantyTable();
  const [rows] = await pool.query(
    `SELECT wr.*, p.name AS product_name 
     FROM warranty_registrations wr 
     JOIN products p ON wr.product_id = p.id 
     ORDER BY wr.registered_at DESC`
  );
  return rows;
};

const updateWarrantyStatus = async (id, status) => {
  await pool.query('UPDATE warranty_registrations SET status = ? WHERE id = ?', [status, id]);
};

const deleteWarranty = async (id) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT registered_serial FROM warranty_registrations WHERE id = ?', [id]);
    if (rows.length > 0) {
      await conn.query("UPDATE product_serials SET status = 'available' WHERE serial_number = ?", [rows[0].registered_serial]);
    }
    await conn.query('DELETE FROM warranty_registrations WHERE id = ?', [id]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

module.exports = { validateSerial, registerWarranty, getAllRegistrations, updateWarrantyStatus, deleteWarranty, initWarrantyTable };
