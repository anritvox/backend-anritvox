// backend/models/addressModel.js
const pool = require('../config/db');

const createAddressTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      line1 VARCHAR(255) NOT NULL,
      line2 VARCHAR(255),
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      pincode VARCHAR(10) NOT NULL,
      is_default TINYINT(1) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
};

const getAddressesByUser = async (userId) => {
  const [rows] = await pool.query(
    'SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC, id DESC',
    [userId]
  );
  return rows;
};

const createAddress = async (userId, data) => {
  if (data.is_default) {
    await pool.query('UPDATE addresses SET is_default=0 WHERE user_id=?', [userId]);
  }
  const [result] = await pool.query(
    `INSERT INTO addresses (user_id,full_name,phone,line1,line2,city,state,pincode,is_default) VALUES (?,?,?,?,?,?,?,?,?)`,
    [userId, data.full_name, data.phone, data.line1, data.line2||null, data.city, data.state, data.pincode, data.is_default?1:0]
  );
  return result.insertId;
};

const updateAddress = async (id, userId, data) => {
  if (data.is_default) {
    await pool.query('UPDATE addresses SET is_default=0 WHERE user_id=?', [userId]);
  }
  await pool.query(
    `UPDATE addresses SET full_name=?,phone=?,line1=?,line2=?,city=?,state=?,pincode=?,is_default=? WHERE id=? AND user_id=?`,
    [data.full_name, data.phone, data.line1, data.line2||null, data.city, data.state, data.pincode, data.is_default?1:0, id, userId]
  );
};

const deleteAddress = async (id, userId) => {
  await pool.query('DELETE FROM addresses WHERE id=? AND user_id=?', [id, userId]);
};

module.exports = { getAddressesByUser, createAddress, updateAddress, deleteAddress, createAddressTable };
