// backend/models/serialModel.js
const pool = require("../config/db");

// Get all serials for a specific product
const getProductSerials = async (productId) => {
  const [rows] = await pool.query(
    `SELECT 
       sn.id,
       sn.serial,
       sn.is_used,
       sn.created_at,
       CASE 
         WHEN wr.id IS NOT NULL THEN 'registered'
         ELSE 'available'
       END as status,
       wr.user_name,
       wr.registered_at
     FROM serial_numbers sn
     LEFT JOIN warranty_registrations wr ON sn.id = wr.serial_number_id
     WHERE sn.product_id = ?
     ORDER BY sn.created_at DESC`,
    [productId]
  );
  return rows;
};

// Add new serials to existing product
const addProductSerials = async (productId, serials) => {
  // Validate product exists
  const [product] = await pool.query(
    "SELECT id, name FROM products WHERE id = ?",
    [productId]
  );
  if (product.length === 0) {
    throw { status: 404, message: "Product not found" };
  }

  // Clean and validate serials
  const cleanedSerials = serials.map((s) => s.trim().toUpperCase());
  const invalidSerials = cleanedSerials.filter((s) => !/^[A-Z0-9]+$/.test(s));

  if (invalidSerials.length > 0) {
    throw {
      status: 400,
      message: `Invalid serial format: ${invalidSerials.join(", ")}`,
    };
  }

  // Check for duplicates within the batch
  const duplicatesInBatch = cleanedSerials.filter(
    (s, i) => cleanedSerials.indexOf(s) !== i
  );
  if (duplicatesInBatch.length > 0) {
    throw {
      status: 400,
      message: `Duplicate serials in batch: ${[
        ...new Set(duplicatesInBatch),
      ].join(", ")}`,
    };
  }

  // Check for existing serials in database
  const [existing] = await pool.query(
    "SELECT serial FROM serial_numbers WHERE serial IN (?)",
    [cleanedSerials]
  );

  if (existing.length > 0) {
    const existingSerials = existing.map((row) => row.serial);
    throw {
      status: 409,
      message: `Serial(s) already exist: ${existingSerials.join(", ")}`,
    };
  }

  // Insert new serials
  const values = cleanedSerials.map((serial) => [productId, serial, 0]);
  const [result] = await pool.query(
    "INSERT INTO serial_numbers (product_id, serial, is_used) VALUES ?",
    [values]
  );

  // Update product quantity
  await pool.query(
    `UPDATE products 
     SET quantity = (SELECT COUNT(*) FROM serial_numbers WHERE product_id = ?) 
     WHERE id = ?`,
    [productId, productId]
  );

  return {
    added: cleanedSerials.length,
    serials: cleanedSerials,
    insertId: result.insertId,
  };
};

// Delete specific serial (with warranty protection)
const deleteProductSerial = async (productId, serialId) => {
  // Check if serial exists and belongs to product
  const [serial] = await pool.query(
    `SELECT sn.id, sn.serial, sn.is_used, wr.id as warranty_id
     FROM serial_numbers sn
     LEFT JOIN warranty_registrations wr ON sn.id = wr.serial_number_id
     WHERE sn.id = ? AND sn.product_id = ?`,
    [serialId, productId]
  );

  if (serial.length === 0) {
    throw { status: 404, message: "Serial number not found for this product" };
  }

  // Prevent deletion if has warranty registration
  if (serial[0].warranty_id) {
    throw {
      status: 409,
      message: `Cannot delete serial '${serial[0].serial}' - it has an active warranty registration`,
    };
  }

  // Delete the serial
  await pool.query("DELETE FROM serial_numbers WHERE id = ?", [serialId]);

  // Update product quantity
  await pool.query(
    `UPDATE products 
     SET quantity = (SELECT COUNT(*) FROM serial_numbers WHERE product_id = ?) 
     WHERE id = ?`,
    [productId, productId]
  );

  return { deleted: serial[0].serial };
};

// Edit specific serial number
const updateProductSerial = async (productId, serialId, newSerial) => {
  const cleanedSerial = newSerial.trim().toUpperCase();

  // Validate format
  if (!/^[A-Z0-9]+$/.test(cleanedSerial)) {
    throw { status: 400, message: "Invalid serial number format" };
  }

  // Check if serial exists and belongs to product
  const [existing] = await pool.query(
    `SELECT serial FROM serial_numbers WHERE id = ? AND product_id = ?`,
    [serialId, productId]
  );

  if (existing.length === 0) {
    throw { status: 404, message: "Serial number not found for this product" };
  }

  // Check if new serial already exists (excluding current one)
  const [duplicate] = await pool.query(
    "SELECT id FROM serial_numbers WHERE serial = ? AND id != ?",
    [cleanedSerial, serialId]
  );

  if (duplicate.length > 0) {
    throw { status: 409, message: `Serial '${cleanedSerial}' already exists` };
  }

  // Update the serial
  await pool.query("UPDATE serial_numbers SET serial = ? WHERE id = ?", [
    cleanedSerial,
    serialId,
  ]);

  return {
    id: serialId,
    oldSerial: existing[0].serial,
    newSerial: cleanedSerial,
  };
};

// Check if serial number is available globally
const checkSerialAvailability = async (serial) => {
  const cleanedSerial = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT 
       sn.id,
       sn.product_id,
       p.name as product_name,
       sn.is_used,
       c.name as category_name
     FROM serial_numbers sn
     JOIN products p ON sn.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE sn.serial = ?`,
    [cleanedSerial]
  );

  return {
    available: rows.length === 0,
    exists: rows.length > 0,
    details: rows.length > 0 ? rows[0] : null,
  };
};

// Get serial statistics for a product
const getProductSerialStats = async (productId) => {
  const [stats] = await pool.query(
    `SELECT 
       COUNT(*) as total_serials,
       SUM(CASE WHEN is_used = 1 THEN 1 ELSE 0 END) as used_serials,
       SUM(CASE WHEN is_used = 0 THEN 1 ELSE 0 END) as available_serials
     FROM serial_numbers 
     WHERE product_id = ?`,
    [productId]
  );
  return stats[0];
};

module.exports = {
  getProductSerials,
  addProductSerials,
  deleteProductSerial,
  updateProductSerial,
  checkSerialAvailability,
  getProductSerialStats,
};
