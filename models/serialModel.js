const pool = require("../config/db");

const getProductSerials = async (productId) => {
  const [rows] = await pool.query(
    `SELECT 
       ps.id,
       ps.serial_number as serial,
       ps.serial_number,
       ps.status,
       ps.created_at,
       wr.user_name,
       wr.registered_at
     FROM product_serials ps
     LEFT JOIN warranty_registrations wr ON ps.serial_number = wr.registered_serial
     WHERE ps.product_id = ?
     ORDER BY ps.created_at DESC`,
    [productId]
  );
  return rows;
};

const addProductSerials = async (productId, serials) => {
  const [product] = await pool.query("SELECT id, name FROM products WHERE id = ?", [productId]);
  if (product.length === 0) throw { status: 404, message: "Product not found" };

  const cleanedSerials = serials.map((s) => s.trim().toUpperCase());
  
  const invalidSerials = cleanedSerials.filter((s) => !/^[A-Z0-9-]+$/.test(s));
  if (invalidSerials.length > 0) {
    throw { status: 400, message: `Invalid serial format detected. Example: ${invalidSerials[0]}` };
  }

  const duplicatesInBatch = cleanedSerials.filter((s, i) => cleanedSerials.indexOf(s) !== i);
  if (duplicatesInBatch.length > 0) {
    throw { status: 400, message: `Duplicate serials found in submission batch.`, duplicates: [...new Set(duplicatesInBatch)] };
  }

  const [existing] = await pool.query(
    "SELECT serial_number FROM product_serials WHERE serial_number IN (?)",
    [cleanedSerials]
  );
  if (existing.length > 0) {
    const existingSerials = existing.map((row) => row.serial_number);
    throw { status: 409, message: `Serial(s) already exist in database.`, duplicates: existingSerials };
  }

  const chunkSize = 1000;
  let firstInsertId = null;

  for (let i = 0; i < cleanedSerials.length; i += chunkSize) {
    const chunk = cleanedSerials.slice(i, i + chunkSize);
    const values = chunk.map((serial) => [productId, serial, 'available']);
    
    const [result] = await pool.query(
      "INSERT INTO product_serials (product_id, serial_number, status) VALUES ?",
      [values]
    );
    if (i === 0) firstInsertId = result.insertId;
  }

  await pool.query(
    `UPDATE products 
     SET quantity = (SELECT COUNT(*) FROM product_serials WHERE product_id = ? AND status = 'available') 
     WHERE id = ?`,
    [productId, productId]
  );

  return { added: cleanedSerials.length, serials: cleanedSerials, insertId: firstInsertId };
};

const deleteProductSerial = async (productId, serialId) => {
  const [serial] = await pool.query(
    `SELECT ps.id, ps.serial_number, ps.status, wr.id as warranty_id
     FROM product_serials ps
     LEFT JOIN warranty_registrations wr ON ps.serial_number = wr.registered_serial
     WHERE ps.id = ? AND ps.product_id = ?`,
    [serialId, productId]
  );

  if (serial.length === 0) throw { status: 404, message: "Serial number not found for this product" };
  if (serial[0].warranty_id || serial[0].status === 'registered') {
    throw { status: 409, message: `Cannot delete serial '${serial[0].serial_number}' - it has an active warranty registration` };
  }

  await pool.query("DELETE FROM product_serials WHERE id = ?", [serialId]);
  await pool.query(
    `UPDATE products SET quantity = (SELECT COUNT(*) FROM product_serials WHERE product_id = ? AND status = 'available') WHERE id = ?`,
    [productId, productId]
  );

  return { deleted: serial[0].serial_number };
};

const updateProductSerial = async (productId, serialId, newSerial) => {
  const cleanedSerial = newSerial.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(cleanedSerial)) throw { status: 400, message: "Invalid serial number format" };

  const [existing] = await pool.query(`SELECT serial_number FROM product_serials WHERE id = ? AND product_id = ?`, [serialId, productId]);
  if (existing.length === 0) throw { status: 404, message: "Serial number not found for this product" };

  const [duplicate] = await pool.query("SELECT id FROM product_serials WHERE serial_number = ? AND id != ?", [cleanedSerial, serialId]);
  if (duplicate.length > 0) throw { status: 409, message: `Serial '${cleanedSerial}' already exists` };

  await pool.query("UPDATE product_serials SET serial_number = ? WHERE id = ?", [cleanedSerial, serialId]);
  return { id: serialId, oldSerial: existing[0].serial_number, newSerial: cleanedSerial };
};

const checkSerialAvailability = async (serial) => {
  const cleanedSerial = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT 
       ps.id, ps.product_id, p.name as product_name, ps.status, c.name as category_name
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE ps.serial_number = ?`,
    [cleanedSerial]
  );

  return {
    available: rows.length > 0 && rows[0].status === 'available',
    exists: rows.length > 0,
    details: rows.length > 0 ? rows[0] : null,
  };
};

const getProductSerialStats = async (productId) => {
  const [stats] = await pool.query(
    `SELECT 
       COUNT(*) as total_serials,
       SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as used_serials,
       SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_serials
     FROM product_serials 
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
