const pool = require('../config/db');

// Professional Serial Format: 4 Prefix + 6 Random (e.g., ABCD123456)
const generateProfessionalSerial = (prefix = 'ANRI') => {
  // Ensure the prefix is exactly 4 characters and uppercase
  const cleanPrefix = prefix.toString().substring(0, 4).toUpperCase().padEnd(4, 'X');
  
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded O, I, 1, 0 to avoid confusion
  let unique = '';
  for (let i = 0; i < 6; i++) {
    unique += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `${cleanPrefix}${unique}`; // Example: ABCD9X2P7M
};

const createSerialTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_serials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      serial_number VARCHAR(50) UNIQUE NOT NULL,
      status ENUM('available', 'sold', 'registered', 'blocked') DEFAULT 'available',
      batch_number VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);
};

const addSerials = async (productId, count, batchNumber, prefix) => {
  const serials = [];
  const totalCount = parseInt(count, 10);
  
  for (let i = 0; i < totalCount; i++) {
    const sn = generateProfessionalSerial(prefix);
    serials.push([productId, sn, 'available', batchNumber]);
  }

  // Use a transaction for bulk insertion
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO product_serials (product_id, serial_number, status, batch_number) VALUES ?',
      [serials]
    );
    await conn.commit();
    return serials.map(s => s[1]); // Return generated serials
  } catch (err) {
    await conn.rollback();
    // Re-throw the error so the controller can send a 500 response
    throw new Error(`Failed to generate serials: ${err.message}`);
  } finally {
    conn.release();
  }
};

const checkSerial = async (serialNumber) => {
  const s = serialNumber.trim().toUpperCase(); // Ensure uppercase check
  const [rows] = await pool.query(
    `SELECT ps.*, p.name as product_name, p.images, p.brand, p.warranty_period
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     WHERE ps.serial_number = ?`,
    [s]
  );
  return rows[0];
};

const updateSerialStatus = async (id, status) => {
  await pool.query('UPDATE product_serials SET status = ? WHERE id = ?', [status, id]);
};

module.exports = {
  createSerialTable,
  addSerials,
  checkSerial,
  updateSerialStatus,
  generateProfessionalSerial
};
