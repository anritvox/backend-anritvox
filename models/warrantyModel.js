const pool = require("../config/db");

const validateSerial = async (serial) => {
  const s = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT ps.id AS serial_id, ps.product_id, ps.serial_number, ps.status, 
            p.name AS product_name, p.brand, p.warranty_period, p.images, 
            c.id AS category_id, c.name AS category_name
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE ps.serial_number = ?`,
    [s]
  );
  
  if (rows.length === 0) throw { status: 404, message: "Serial number not found in our authentic database." };
  
  const rec = rows[0];

    
  }
  return rec;
};

const registerWarranty = async ({ serialNumber, productId, customerName, email, phone, purchaseDate, invoiceNumber }) => {
  const rec = await validateSerial(serialNumber);
  if (rec.product_id !== Number(productId)) throw { status: 400, message: "Product mismatch for given serial number." };
  // Now check if it's available for registration (not already registered or sold)
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
      [rec.serial_number, productId, customerName, email, phone, purchaseDate, invoiceNumber]
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
  const [rows] = await pool.query(
    `SELECT wr.*, p.name AS product_name 
     FROM warranty_registrations wr 
     JOIN products p ON wr.product_id = p.id 
     ORDER BY wr.registered_at DESC`
  );
  return rows;
};

// ADDED: Update status logic
const updateWarrantyStatus = async (id, status) => {
  await pool.query('UPDATE warranty_registrations SET status = ? WHERE id = ?', [status, id]);
};

// ADDED: Delete logic (also resets the serial back to 'available')
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

module.exports = { validateSerial, registerWarranty, getAllRegistrations, updateWarrantyStatus, deleteWarranty };
