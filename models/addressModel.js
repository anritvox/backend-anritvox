const pool = require('../config/db');

async function createAddressTable() {
  const query = `
    CREATE TABLE IF NOT EXISTS addresses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      street_address TEXT NOT NULL,
      city VARCHAR(100) NOT NULL,
      state VARCHAR(100) NOT NULL,
      postal_code VARCHAR(20) NOT NULL,
      country VARCHAR(100) DEFAULT 'India',
      is_default BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await pool.query(query);
    console.log("[DB] Addresses table ready.");
  } catch (error) {
    console.error("[DB] Error initializing addresses table:", error);
    throw error;
  }
}

const AddressModel = {
  createAddress: async (userId, data) => {
    const { full_name, phone_number, street_address, city, state, postal_code, country, is_default } = data;
    
    // If this is the new default, unset the old default first
    if (is_default) {
      await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
    }

    const [result] = await pool.query(
      `INSERT INTO addresses (user_id, full_name, phone_number, street_address, city, state, postal_code, country, is_default) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, full_name, phone_number, street_address, city, state, postal_code, country || 'India', is_default ? 1 : 0]
    );
    return result.insertId;
  },

  getUserAddresses: async (userId) => {
    const [rows] = await pool.query('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', [userId]);
    return rows;
  },

  getDefaultAddress: async (userId) => {
    const [rows] = await pool.query('SELECT * FROM addresses WHERE user_id = ? AND is_default = TRUE LIMIT 1', [userId]);
    return rows[0] || null;
  },

  setAsDefault: async (userId, addressId) => {
    // Transactional logic: Unset all, then set the specific one
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
      await connection.query('UPDATE addresses SET is_default = TRUE WHERE id = ? AND user_id = ?', [addressId, userId]);
      await connection.commit();
      return true;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  deleteAddress: async (userId, addressId) => {
    const [result] = await pool.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [addressId, userId]);
    return result.affectedRows > 0;
  }
};

module.exports = {
  createAddressTable,
  AddressModel
};
