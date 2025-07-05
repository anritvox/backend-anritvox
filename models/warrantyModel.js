// backend/models/warrantyModel.js
const pool = require("../config/db");

// 1) Validate a serial number: exists and unused
const validateSerial = async (serial) => {
  const s = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT
       sn.id        AS serial_number_id,
       sn.product_id            AS product_id,
       p.name       AS product_name,
       c.id         AS category_id,
       c.name       AS category_name,
       sn.is_used
     FROM serial_numbers sn
     JOIN products   p ON sn.product_id   = p.id
     JOIN categories c ON p.category_id   = c.id
     WHERE sn.serial = ?`,
    [s]
  );
  if (rows.length === 0) {
    throw { status: 404, message: "Serial number not found" };
  }
  const rec = rows[0];
  if (rec.is_used) {
    throw { status: 400, message: "Serial number already registered" };
  }
  return rec;
};

// 2) Register a warranty
const registerWarranty = async ({
  serial,
  product_id,
  user_name,
  user_email,
  user_phone,
}) => {
  // a) Validate & fetch serial_number_id + product linkage
  const rec = await validateSerial(serial);

  // b) Ensure the passed product_id matches the serial’s product
  if (rec.product_id !== Number(product_id)) {
    throw { status: 400, message: "Product mismatch for given serial" };
  }

  // c) Insert into warranty_registrations
  const [result] = await pool.query(
    `INSERT INTO warranty_registrations
       (serial_number_id, product_id, user_name, user_email, user_phone)
     VALUES (?, ?, ?, ?, ?)`,
    [rec.serial_number_id, product_id, user_name, user_email, user_phone]
  );

  // d) Mark the serial as used
  await pool.query(
    `UPDATE serial_numbers
       SET is_used = 1
     WHERE id = ?`,
    [rec.serial_number_id]
  );

  return { registration_id: result.insertId };
};

// 3) Fetch all registrations (admin)
const getAllRegistrations = async () => {
  const [rows] = await pool.query(
    `SELECT
       wr.id,
       sn.serial,
       p.id   AS product_id,
       p.name AS product_name,
       c.id   AS category_id,
       c.name AS category_name,
       wr.user_name,
       wr.user_email,
       wr.user_phone,
       wr.registered_at,
       wr.status
     FROM warranty_registrations wr
     JOIN serial_numbers sn ON wr.serial_number_id = sn.id
     JOIN products       p  ON wr.product_id         = p.id
     JOIN categories     c  ON p.category_id         = c.id
     ORDER BY wr.registered_at DESC`
  );
  return rows;
};

// 4) Update a registration's status
const updateRegistrationStatus = async (id, status) => {
  if (!["accepted", "rejected"].includes(status)) {
    throw { status: 400, message: "Invalid status" };
  }
  // Update status
  await pool.query(
    `UPDATE warranty_registrations
       SET status = ?
     WHERE id = ?`,
    [status, id]
  );
  // If rejected, free up the serial
  if (status === "rejected") {
    const [[{ serial_number_id }]] = await pool.query(
      `SELECT serial_number_id FROM warranty_registrations WHERE id = ?`,
      [id]
    );
    await pool.query(`UPDATE serial_numbers SET is_used = 0 WHERE id = ?`, [
      serial_number_id,
    ]);
  }
  return { id, status };
};

// 5) Delete a registration (and reset its serial)
const deleteRegistration = async (id) => {
  const [[{ serial_number_id }]] = await pool.query(
    `SELECT serial_number_id FROM warranty_registrations WHERE id = ?`,
    [id]
  );
  await pool.query(`DELETE FROM warranty_registrations WHERE id = ?`, [id]);
  await pool.query(`UPDATE serial_numbers SET is_used = 0 WHERE id = ?`, [
    serial_number_id,
  ]);
};

module.exports = {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateRegistrationStatus,
  deleteRegistration,
};
