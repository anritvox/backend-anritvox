const pool = require('../config/db');
const crypto = require('crypto');

// ============= SERIAL NUMBER GENERATOR =============
// Generates unique, sortable serial numbers with timestamp and checksum
// Format: PREFIX-YYMM-XXXXXX-CC
// Example: ANRI-2603-A3B7K9-F2
// PREFIX: 4 chars product prefix
// YYMM: Year Month for sorting
// XXXXXX: 6 random alphanumeric chars
// CC: 2 char checksum for validation

const generateEnhancedSerial = (prefix = 'ANRI') => {
  const cleanPrefix = prefix.toString().substring(0, 4).toUpperCase().padEnd(4, 'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars: 0,O,1,I

  // Add timestamp component for better sorting and uniqueness
  const date = new Date();
  const yearMonth = (date.getFullYear() % 100).toString().padStart(2, '0') +
                    (date.getMonth() + 1).toString().padStart(2, '0');

  // Generate 6 random characters
  let unique = '';
  for (let i = 0; i < 6; i++) {
    unique += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Generate 2-character checksum for validation
  const baseSerial = `${cleanPrefix}-${yearMonth}-${unique}`;
  const checksum = generateChecksum(baseSerial);

  return `${baseSerial}-${checksum}`;
};

// Generate checksum for serial validation
const generateChecksum = (serial) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hash = crypto.createHash('md5').update(serial).digest('hex');
  return (chars.charAt(parseInt(hash[0], 16) % chars.length) +
          chars.charAt(parseInt(hash[1], 16) % chars.length));
};

// Validate serial number checksum (new format only: PREFIX-YYMM-XXXXXX-CC)
const validateSerialChecksum = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  if (parts.length !== 4) return false;

  const baseSerial = parts.slice(0, 3).join('-');
  const providedChecksum = parts[3];
  const calculatedChecksum = generateChecksum(baseSerial);

  return providedChecksum === calculatedChecksum;
};

// Detect if a serial is in the new enhanced format (PREFIX-YYMM-XXXXXX-CC)
const isNewFormatSerial = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  return parts.length === 4;
};

// ============= DATABASE SCHEMA =============
const createSerialTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_serials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      serial_number VARCHAR(50) UNIQUE NOT NULL,
      status ENUM('available', 'sold', 'registered', 'blocked') DEFAULT 'available',
      batch_number VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      INDEX idx_product_id (product_id),
      INDEX idx_status (status),
      INDEX idx_batch_number (batch_number),
      INDEX idx_serial_number (serial_number),
      INDEX idx_created_at (created_at)
    )
  `);
};

// ============= BULK SERIAL GENERATION =============
// Optimized for generating up to 1 million serials
const addSerials = async (productId, count, batchNumber, prefix) => {
  const serials = [];
  const totalCount = parseInt(count, 10);

  if (totalCount > 100000) {
    throw new Error('Cannot generate more than 100,000 serials in one batch. Please split into multiple batches.');
  }

  // Generate unique serials with collision detection
  const serialSet = new Set();
  while (serialSet.size < totalCount) {
    const sn = generateEnhancedSerial(prefix);
    serialSet.add(sn);
  }

  // Prepare batch insert data
  serialSet.forEach(sn => {
    serials.push([productId, sn, 'available', batchNumber, null]);
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert in chunks for better performance
    const chunkSize = 1000;
    for (let i = 0; i < serials.length; i += chunkSize) {
      const chunk = serials.slice(i, i + chunkSize);
      await conn.query(
        'INSERT INTO product_serials (product_id, serial_number, status, batch_number, notes) VALUES ?',
        [chunk]
      );
    }

    await conn.commit();
    return Array.from(serialSet);
  } catch (err) {
    await conn.rollback();
    throw new Error(`Failed to generate serials: ${err.message}`);
  } finally {
    conn.release();
  }
};

// ============= ADVANCED QUERYING WITH PAGINATION =============
const getSerialsByProduct = async (productId, options = {}) => {
  const {
    page = 1,
    limit = 100,
    status,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM product_serials WHERE product_id = ?';
  const params = [productId];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  // Validate sort column to prevent SQL injection
  const validSortColumns = ['created_at', 'serial_number', 'status', 'batch_number'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

  query += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM product_serials WHERE product_id = ?';
  const countParams = [productId];
  if (status) {
    countQuery += ' AND status = ?';
    countParams.push(status);
  }
  const [[{ total }]] = await pool.query(countQuery, countParams);

  return {
    serials: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

// Get all serials with advanced filtering
const getAllSerials = async (options = {}) => {
  const {
    page = 1,
    limit = 100,
    status,
    productId,
    batchNumber,
    searchTerm,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = options;

  const offset = (page - 1) * limit;

  let query = 'SELECT ps.*, p.name as product_name FROM product_serials ps LEFT JOIN products p ON ps.product_id = p.id WHERE 1=1';
  const params = [];

  if (status) {
    query += ' AND ps.status = ?';
    params.push(status);
  }
  if (productId) {
    query += ' AND ps.product_id = ?';
    params.push(productId);
  }
  if (batchNumber) {
    query += ' AND ps.batch_number = ?';
    params.push(batchNumber);
  }
  if (searchTerm) {
    query += ' AND (ps.serial_number LIKE ? OR p.name LIKE ?)';
    params.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  // Validate and add sorting
  const validSortColumns = ['created_at', 'serial_number', 'status', 'batch_number', 'product_name'];
  const validSortOrders = ['ASC', 'DESC'];
  const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

  query += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM product_serials ps LEFT JOIN products p ON ps.product_id = p.id WHERE 1=1';
  const countParams = [];
  if (status) {
    countQuery += ' AND ps.status = ?';
    countParams.push(status);
  }
  if (productId) {
    countQuery += ' AND ps.product_id = ?';
    countParams.push(productId);
  }
  if (batchNumber) {
    countQuery += ' AND ps.batch_number = ?';
    countParams.push(batchNumber);
  }
  if (searchTerm) {
    countQuery += ' AND (ps.serial_number LIKE ? OR p.name LIKE ?)';
    countParams.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  const [[{ total }]] = await pool.query(countQuery, countParams);

  return {
    serials: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

// ============= SERIAL VALIDATION =============
// Supports BOTH old serials (any format) and new format (PREFIX-YYMM-XXXXXX-CC).
// Old serials are looked up directly in the DB without checksum validation.
// New-format serials (4 parts) are checksum-validated before DB lookup.
const checkSerial = async (serialNumber) => {
  const s = serialNumber.trim().toUpperCase();

  // If it looks like the new enhanced format, validate checksum first
  if (isNewFormatSerial(s)) {
    if (!validateSerialChecksum(s)) {
      throw new Error('Invalid serial number format or checksum');
    }
  }
  // If it's an old format serial, skip checksum validation and go straight to DB

  const [rows] = await pool.query(
    `SELECT ps.*, p.name as product_name, p.images, p.brand, p.warranty_period
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     WHERE ps.serial_number = ?`,
    [s]
  );

  return rows[0];
};

// ============= SERIAL MANAGEMENT =============
const updateSerialStatus = async (id, status, notes = null) => {
  const validStatuses = ['available', 'sold', 'registered', 'blocked'];
  if (!validStatuses.includes(status)) {
    throw new Error('Invalid status. Must be one of: ' + validStatuses.join(', '));
  }

  const updateFields = ['status = ?'];
  const params = [status];

  if (notes !== null) {
    updateFields.push('notes = ?');
    params.push(notes);
  }

  params.push(id);
  await pool.query(`UPDATE product_serials SET ${updateFields.join(', ')} WHERE id = ?`, params);
};

const deleteSerial = async (id) => {
  await pool.query('DELETE FROM product_serials WHERE id = ?', [id]);
};

// Bulk delete by batch number
const deleteBatch = async (batchNumber) => {
  const [result] = await pool.query('DELETE FROM product_serials WHERE batch_number = ?', [batchNumber]);
  return result.affectedRows;
};

// Get statistics
const getSerialStatistics = async (productId = null) => {
  let query = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
      SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as registered,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM product_serials
  `;
  const params = [];

  if (productId) {
    query += ' WHERE product_id = ?';
    params.push(productId);
  }

  const [[stats]] = await pool.query(query, params);
  return stats;
};

module.exports = {
  createSerialTable,
  addSerials,
  checkSerial,
  getSerialsByProduct,
  getAllSerials,
  updateSerialStatus,
  deleteSerial,
  deleteBatch,
  getSerialStatistics,
  generateEnhancedSerial,
  validateSerialChecksum,
  isNewFormatSerial
};
