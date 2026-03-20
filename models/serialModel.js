const pool = require('../config/db');
const crypto = require('crypto');

const generateEnhancedSerial = (prefix = 'ANRI') => {
  const cleanPrefix = prefix.toString().substring(0, 4).toUpperCase().padEnd(4, 'X');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  const date = new Date();
  const yearMonth = (date.getFullYear() % 100).toString().padStart(2, '0') +
                    (date.getMonth() + 1).toString().padStart(2, '0');
  let unique = '';
  for (let i = 0; i < 6; i++) {
    unique += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const baseSerial = `${cleanPrefix}-${yearMonth}-${unique}`;
  const checksum = generateChecksum(baseSerial);
  return `${baseSerial}-${checksum}`;
};

const generateChecksum = (serial) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const hash = crypto.createHash('md5').update(serial).digest('hex');
  return (chars.charAt(parseInt(hash[0], 16) % chars.length) +
          chars.charAt(parseInt(hash[1], 16) % chars.length));
};

const validateSerialChecksum = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  if (parts.length !== 4) return false;
  const baseSerial = parts.slice(0, 3).join('-');
  const providedChecksum = parts[3];
  const calculatedChecksum = generateChecksum(baseSerial);
  return providedChecksum === calculatedChecksum;
};

const isNewFormatSerial = (serial) => {
  if (!serial || typeof serial !== 'string') return false;
  const parts = serial.split('-');
  return parts.length === 4;
};

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
      INDEX idx_product_id (product_id)
    )
  `);
};

const addSerials = async (productId, count, batchNumber, prefix) => {
  const serials = [];
  const totalCount = parseInt(count, 10);
  const serialSet = new Set();
  while (serialSet.size < totalCount) {
    const sn = generateEnhancedSerial(prefix);
    serialSet.add(sn);
  }
  serialSet.forEach(sn => {
    serials.push([productId, sn, 'available', batchNumber, null]);
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
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

const getSerialsByProduct = async (productId, options = {}) => {
  const { page = 1, limit = 100, status, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  const offset = (page - 1) * limit;
  let query = 'SELECT * FROM product_serials WHERE product_id = ?';
  const params = [productId];
  if (status) { query += ' AND status = ?'; params.push(status); }
  
  const safeSort = ['created_at', 'serial_number', 'status', 'batch_number'].includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  query += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  const labeledSerials = rows.map(row => ({
      ...row,
      is_new_format: isNewFormatSerial(row.serial_number),
      serial_type: isNewFormatSerial(row.serial_number) ? 'NEW' : 'OLD'
  }));

  let countQuery = 'SELECT COUNT(*) as total FROM product_serials WHERE product_id = ?';
  const countParams = [productId];
  if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
  const [[{ total }]] = await pool.query(countQuery, countParams);

  return {
    serials: labeledSerials,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const getAllSerials = async (options = {}) => {
  const { page = 1, limit = 100, status, productId, batchNumber, searchTerm, sortBy = 'created_at', sortOrder = 'DESC' } = options;
  const offset = (page - 1) * limit;
  let query = 'SELECT ps.*, p.name as product_name FROM product_serials ps LEFT JOIN products p ON ps.product_id = p.id WHERE 1=1';
  const params = [];
  if (status) { query += ' AND ps.status = ?'; params.push(status); }
  if (productId) { query += ' AND ps.product_id = ?'; params.push(productId); }
  if (batchNumber) { query += ' AND ps.batch_number = ?'; params.push(batchNumber); }
  if (searchTerm) {
    query += ' AND (ps.serial_number LIKE ? OR p.name LIKE ?)';
    params.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }
  const safeSort = ['created_at', 'serial_number', 'status', 'batch_number', 'product_name'].includes(sortBy) ? sortBy : 'created_at';
  const safeOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
  query += ` ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [rows] = await pool.query(query, params);
  const labeledSerials = rows.map(row => ({
      ...row,
      is_new_format: isNewFormatSerial(row.serial_number),
      serial_type: isNewFormatSerial(row.serial_number) ? 'NEW' : 'OLD'
  }));

  let countQuery = 'SELECT COUNT(*) as total FROM product_serials ps LEFT JOIN products p ON ps.product_id = p.id WHERE 1=1';
  const countParams = [];
  if (status) { countQuery += ' AND ps.status = ?'; countParams.push(status); }
  if (productId) { countQuery += ' AND ps.product_id = ?'; countParams.push(productId); }
  if (batchNumber) { countQuery += ' AND ps.batch_number = ?'; countParams.push(batchNumber); }
  if (searchTerm) {
    countQuery += ' AND (ps.serial_number LIKE ? OR p.name LIKE ?)';
    countParams.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }
  const [[{ total }]] = await pool.query(countQuery, countParams);

  return {
    serials: labeledSerials,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
};

const checkSerial = async (serialNumber) => {
  const s = serialNumber.trim().toUpperCase();
  if (isNewFormatSerial(s)) {
    if (!validateSerialChecksum(s)) throw new Error('Invalid serial number format or checksum');
  }
  const [rows] = await pool.query(
    `SELECT ps.*, p.name as product_name, p.images, p.brand, p.warranty_period
     FROM product_serials ps JOIN products p ON ps.product_id = p.id WHERE ps.serial_number = ?`,
    [s]
  );
  return rows[0];
};

const updateSerialStatus = async (id, status, notes = null) => {
  const updateFields = ['status = ?'];
  const params = [status];
  if (notes !== null) { updateFields.push('notes = ?'); params.push(notes); }
  params.push(id);
  await pool.query(`UPDATE product_serials SET ${updateFields.join(', ')} WHERE id = ?`, params);
};

const deleteSerial = async (id) => {
  await pool.query('DELETE FROM product_serials WHERE id = ?', [id]);
};

const deleteBatch = async (batchNumber) => {
  const [result] = await pool.query('DELETE FROM product_serials WHERE batch_number = ?', [batchNumber]);
  return result.affectedRows;
};

const getSerialStatistics = async (productId = null) => {
  let query = `
    SELECT
      COUNT(*) as total_serials,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_serials,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
      SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as used_serials,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM product_serials
  `;
  const params = [];
  if (productId) { query += ' WHERE product_id = ?'; params.push(productId); }
  const [[stats]] = await pool.query(query, params);
  return stats;
};

module.exports = {
  createSerialTable, addSerials, checkSerial, getSerialsByProduct, getAllSerials,
  updateSerialStatus, deleteSerial, deleteBatch, getSerialStatistics,
  generateEnhancedSerial, validateSerialChecksum, isNewFormatSerial
};
