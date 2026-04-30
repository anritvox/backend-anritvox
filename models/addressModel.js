const pool = require('../config/db');

/**
 * Initializes the addresses table if it doesn't exist.
 * Matches the schema used in the model functions below.
 */
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
    console.error("[DB Error] Error initializing addresses table:", error.message);
    throw error;
  }
}

const AddressModel = {
  /**
   * Create a new address for a user.
   * Logic: If is_default is true, it resets other addresses for that user first.
   */
  createAddress: async (userId, data) => {
    const { 
      full_name, 
      phone_number, 
      street_address, 
      city, 
      state, 
      postal_code, 
      country, 
      is_default 
    } = data;

    try {
      // Handle default address toggle
      if (is_default) {
        await pool.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
      }

      const [result] = await pool.query(
        `INSERT INTO addresses (user_id, full_name, phone_number, street_address, city, state, postal_code, country, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, 
          full_name, 
          phone_number, 
          street_address, 
          city, 
          state, 
          postal_code, 
          country || 'India', 
          is_default ? 1 : 0
        ]
      );
      return result.insertId;
    } catch (error) {
      console.error("[AddressModel.createAddress Error]:", error.message);
      throw error;
    }
  },

  /**
   * Get all addresses for a specific user.
   */
  getUserAddresses: async (userId) => {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC', 
        [userId]
      );
      return rows;
    } catch (error) {
      console.error("[AddressModel.getUserAddresses Error]:", error.message);
      throw error;
    }
  },

  /**
   * Fetch the current default address for a user.
   */
  getDefaultAddress: async (userId) => {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM addresses WHERE user_id = ? AND is_default = TRUE LIMIT 1', 
        [userId]
      );
      return rows[0] || null;
    } catch (error) {
      console.error("[AddressModel.getDefaultAddress Error]:", error.message);
      throw error;
    }
  },

  /**
   * Switch the default address using a transaction to ensure data consistency.
   */
  setAsDefault: async (userId, addressId) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Step 1: Remove default status from all user addresses
      await connection.query('UPDATE addresses SET is_default = FALSE WHERE user_id = ?', [userId]);
      
      // Step 2: Set the specific address as default
      const [result] = await connection.query(
        'UPDATE addresses SET is_default = TRUE WHERE id = ? AND user_id = ?', 
        [addressId, userId]
      );
      
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      console.error("[AddressModel.setAsDefault Error]:", error.message);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Remove an address record.
   */
  deleteAddress: async (userId, addressId) => {
    try {
      const [result] = await pool.query(
        'DELETE FROM addresses WHERE id = ? AND user_id = ?', 
        [addressId, userId]
      );
      return result.affectedRows > 0;
    } catch (error) {
      console.error("[AddressModel.deleteAddress Error]:", error.message);
      throw error;
    }
  }
};

module.exports = {
  createAddressTable,
  AddressModel
};
