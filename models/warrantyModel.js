const pool = require("../config/db");

// 1) Validate a serial number: exists and available in the UNIFIED table
const validateSerial = async (serial) => {
  const s = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT
       ps.id AS serial_id,
       ps.product_id,
       ps.serial_number,
       ps.status,
       p.name AS product_name,
       p.brand,
       p.warranty_period,
       p.images,
       c.id AS category_id,
       c.name AS category_name
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE ps.serial_number = ?`,
    [s]
  );
  
  if (rows.length === 0) {
    throw { status: 404, message: "Serial number not found in our authentic database." };
  }
  
  const rec = rows[0];
  if (rec.status === 'registered' || rec.status === 'sold') {
    throw { status: 400, message: "This serial number is already registered for warranty." };
  }
  
  return rec;
};

// 2) Register a warranty
const registerWarranty = async ({
  serialNumber,
  productId,
  customerName,
  email,
  phone,
  purchaseDate,
  invoiceNumber
}) => {
  const rec = await validateSerial(serialNumber);

  if (rec.product_id !== Number(productId)) {
    throw { status: 400, message: "Product mismatch for given serial number." };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert into registrations
    const [result] = await conn.query(
      `INSERT INTO warranty_registrations
         (registered_serial, product_id, user_name, user_email, user_phone, purchase_date, invoice_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted')`,
      [serialNumber, productId, customerName, email, phone, purchaseDate, invoiceNumber]
    );

    // Update status in the unified serials table
    await conn.query(
      `UPDATE product_serials SET status = 'registered' WHERE serial_number = ?`,
      [serialNumber]
    );

    await conn.commit();
    return { registration_id: result.insertId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// 3) Fetch all registrations (admin)
const getAllRegistrations = async () => {
  const [rows] = await pool.query(
    `SELECT
       wr.*,
       p.name AS product_name
     FROM warranty_registrations wr
     JOIN products p ON wr.product_id = p.id
     ORDER BY wr.registered_at DESC`
  );
  return rows;
};

module.exports = {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
};
