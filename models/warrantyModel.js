const pool = require("../config/db");

// 1) Validate a serial number: exists and available
const validateSerial = async (serial) => {
  const s = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT
       ps.id AS serial_id,
       ps.product_id,
       ps.serial_number,
       ps.status,
       ps.batch_number,
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
  if (rec.status === 'blocked') {
    throw { status: 403, message: "This serial number has been blocked by the manufacturer." };
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
  // a) Validate & fetch product linkage
  const rec = await validateSerial(serialNumber);

  // b) Ensure product matches
  if (rec.product_id !== Number(productId)) {
    throw { status: 400, message: "Product mismatch for given serial number." };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // c) Insert into warranty_registrations with new fields
    const [result] = await conn.query(
      `INSERT INTO warranty_registrations
         (registered_serial, product_id, user_name, user_email, user_phone, purchase_date, invoice_number, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted')`,
      [serialNumber, productId, customerName, email, phone, purchaseDate, invoiceNumber]
    );

    // d) Mark the unified serial as registered
    await conn.query(
      `UPDATE product_serials SET status = 'registered' WHERE serial_number = ?`,
      [serialNumber]
    );

    await conn.commit();
    return { registration_id: result.insertId };
  } catch (error) {
    await conn.rollback();
    throw { status: 500, message: "Database error during registration." };
  } finally {
    conn.release();
  }
};

// 3) Fetch all registrations (admin)
const getAllRegistrations = async () => {
  const [rows] = await pool.query(
    `SELECT
       wr.id,
       wr.registered_serial AS serial,
       wr.product_id,
       p.name AS product_name,
       wr.user_name,
       wr.user_email,
       wr.user_phone,
       wr.purchase_date,
       wr.invoice_number,
       wr.registered_at,
       wr.status
     FROM warranty_registrations wr
     JOIN products p ON wr.product_id = p.id
     ORDER BY wr.registered_at DESC`
  );
  return rows;
};

// 4) Update a registration's status
const updateRegistrationStatus = async (id, status) => {
  if (!["accepted", "pending", "rejected"].includes(status)) {
    throw { status: 400, message: "Invalid status" };
  }
  
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // Update status
    await conn.query(`UPDATE warranty_registrations SET status = ? WHERE id = ?`, [status, id]);
    
    // If rejected, free up the serial in the unified table
    if (status === "rejected") {
      const [[{ registered_serial }]] = await conn.query(
        `SELECT registered_serial FROM warranty_registrations WHERE id = ?`, [id]
      );
      if (registered_serial) {
        await conn.query(`UPDATE product_serials SET status = 'available' WHERE serial_number = ?`, [registered_serial]);
      }
    }
    
    await conn.commit();
    return { id, status };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// 5) Delete a registration
const deleteRegistration = async (id) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    const [[{ registered_serial }]] = await conn.query(
      `SELECT registered_serial FROM warranty_registrations WHERE id = ?`, [id]
    );
    
    await conn.query(`DELETE FROM warranty_registrations WHERE id = ?`, [id]);
    
    if (registered_serial) {
      await conn.query(`UPDATE product_serials SET status = 'available' WHERE serial_number = ?`, [registered_serial]);
    }
    
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

module.exports = {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateRegistrationStatus,
  deleteRegistration,
};
