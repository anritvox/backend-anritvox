// backend/models/serialModel.js
const pool = require("../config/db");

// ─── Helper: safely add a column (idempotent) ───────────────────────────────
const addCol = async (table, sql) => {
  try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${sql}`); } catch (e) {}
};

// ─── Helper: safely add an index (idempotent) ───────────────────────────────
const addIndex = async (table, indexName, columns) => {
  try { await pool.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`); } catch (e) {}
};

// ─── Run once on startup: migrate product_serials for new-policy fields ──────
const initSerialTable = async () => {
  // base_warranty_months: set by admin at generation time (null = legacy serial)
  await addCol('product_serials', 'base_warranty_months INT NULL DEFAULT NULL AFTER status');
  // is_legacy: false for serials generated under the new e-warranty policy
  await addCol('product_serials', 'is_legacy TINYINT(1) NOT NULL DEFAULT 1 AFTER base_warranty_months');
  // batch_number: tracking code for batch assignments
  await addCol('product_serials', 'batch_number VARCHAR(100) NULL DEFAULT NULL AFTER is_legacy');
  // notes: descriptive field for audit logs
  await addCol('product_serials', 'notes TEXT NULL DEFAULT NULL AFTER batch_number');

  // Dynamic index deployment optimized for 1M+ rows under the advanced architecture
  await addIndex('product_serials', 'idx_product_id', 'product_id');
  await addIndex('product_serials', 'idx_status', 'status');
  await addIndex('product_serials', 'idx_batch_number', 'batch_number');
  await addIndex('product_serials', 'idx_serial_number', 'serial_number');
  await addIndex('product_serials', 'idx_created_at', 'created_at');
};

const createSerialTable = initSerialTable;

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

  let whereClauses = [];
  let params = [];

  if (status) {
    whereClauses.push("ps.status = ?");
    params.push(status);
  }
  if (productId) {
    whereClauses.push("ps.product_id = ?");
    params.push(productId);
  }
  if (batchNumber) {
    whereClauses.push("ps.batch_number = ?");
    params.push(batchNumber);
  }
  if (searchTerm) {
    whereClauses.push("(ps.serial_number LIKE ? OR p.name LIKE ?)");
    params.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

  // Compute absolute matching counts for safe pagination metadata
  const countSql = `
    SELECT COUNT(*) as total 
    FROM product_serials ps
    LEFT JOIN products p ON ps.product_id = p.id
    ${whereSql}
  `;
  const [countRows] = await pool.query(countSql, params);
  const total = countRows[0].total;

  const allowedSortCols = ['created_at', 'serial_number', 'status', 'base_warranty_months', 'is_legacy', 'batch_number', 'id'];
  const actualSortBy = allowedSortCols.includes(sortBy) ? sortBy : 'created_at';
  const actualSortOrder = ['ASC', 'DESC'].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const selectSql = `
    SELECT 
      ps.id,
      ps.product_id,
      p.name as product_name,
      ps.serial_number as serial,
      ps.serial_number,
      ps.status,
      ps.created_at,
      ps.base_warranty_months,
      ps.is_legacy,
      ps.batch_number,
      ps.notes,
      wr.user_name,
      wr.registered_at
    FROM product_serials ps
    LEFT JOIN products p ON ps.product_id = p.id
    LEFT JOIN warranty_registrations wr ON ps.serial_number = wr.registered_serial
    ${whereSql}
    ORDER BY ps.${actualSortBy} ${actualSortOrder}
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(selectSql, [...params, parseInt(limit, 10), parseInt(offset, 10)]);

  return {
    serials: rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages: Math.ceil(total / parseInt(limit, 10))
    }
  };
};

const getProductSerials = async (productId) => {
  const [rows] = await pool.query(
    `SELECT
        ps.id,
        ps.serial_number as serial,
        ps.serial_number,
        ps.status,
        ps.created_at,
        ps.base_warranty_months,
        ps.is_legacy,
        ps.batch_number,
        ps.notes,
        wr.user_name,
        wr.registered_at
     FROM product_serials ps
     LEFT JOIN warranty_registrations wr ON ps.serial_number = wr.registered_serial
     WHERE ps.product_id = ?
     ORDER BY ps.created_at DESC`,
    [productId]
  );
  return rows;
};

// base_warranty_months: optional, passed only for new-policy serials
const addProductSerials = async (productId, serials, base_warranty_months = null, batch_number = null, notes = null) => {
  const [product] = await pool.query("SELECT id, name FROM products WHERE id = ?", [productId]);
  if (product.length === 0) throw { status: 404, message: "Product not found" };

  const cleanedSerials = serials.map((s) => s.trim().toUpperCase());

  const invalidSerials = cleanedSerials.filter((s) => !/^[A-Z0-9-]+$/.test(s));
  if (invalidSerials.length > 0) {
    throw { status: 400, message: `Invalid serial format detected. Example: ${invalidSerials[0]}` };
  }

  const duplicatesInBatch = cleanedSerials.filter((s, i) => cleanedSerials.indexOf(s) !== i);
  if (duplicatesInBatch.length > 0) {
    throw { status: 400, message: `Duplicate serials found in submission batch.`, duplicates: [...new Set(duplicatesInBatch)] };
  }

  const [existing] = await pool.query(
    "SELECT serial_number FROM product_serials WHERE serial_number IN (?)",
    [cleanedSerials]
  );
  if (existing.length > 0) {
    const existingSerials = existing.map((row) => row.serial_number);
    throw { status: 409, message: `Serial(s) already exist in database.`, duplicates: existingSerials };
  }

  // Determine if this is a new-policy serial or legacy
  const isLegacy = (base_warranty_months === null || base_warranty_months === undefined) ? 1 : 0;

  const chunkSize = 1000;
  let firstInsertId = null;
  
  for (let i = 0; i < cleanedSerials.length; i += chunkSize) {
    const chunk = cleanedSerials.slice(i, i + chunkSize);
    const values = chunk.map((serial) => [productId, serial, 'available', base_warranty_months, isLegacy, batch_number, notes]);

    const [result] = await pool.query(
      "INSERT INTO product_serials (product_id, serial_number, status, base_warranty_months, is_legacy, batch_number, notes) VALUES ?",
      [values]
    );
    if (i === 0) firstInsertId = result.insertId;
  }

  return { added: cleanedSerials.length, serials: cleanedSerials, insertId: firstInsertId };
};

const deleteProductSerial = async (productId, serialId) => {
  const [serial] = await pool.query(
    `SELECT ps.id, ps.serial_number, ps.status, wr.id as warranty_id
     FROM product_serials ps
     LEFT JOIN warranty_registrations wr ON ps.serial_number = wr.registered_serial
     WHERE ps.id = ? AND ps.product_id = ?`,
    [serialId, productId]
  );
  
  if (serial.length === 0) throw { status: 404, message: "Serial number not found for this product" };
  if (serial[0].warranty_id || serial[0].status === 'registered') {
    throw { status: 409, message: `Cannot delete serial '${serial[0].serial_number}' - it has an active warranty registration` };
  }
  
  await pool.query("DELETE FROM product_serials WHERE id = ?", [serialId]);
  
  return { deleted: serial[0].serial_number };
};

const updateProductSerial = async (productId, serialId, newSerial) => {
  const cleanedSerial = newSerial.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(cleanedSerial)) throw { status: 400, message: "Invalid serial number format" };
  
  const [existing] = await pool.query(`SELECT serial_number FROM product_serials WHERE id = ? AND product_id = ?`, [serialId, productId]);
  if (existing.length === 0) throw { status: 404, message: "Serial number not found for this product" };
  
  const [duplicate] = await pool.query("SELECT id FROM product_serials WHERE serial_number = ? AND id != ?", [cleanedSerial, serialId]);
  if (duplicate.length > 0) throw { status: 409, message: `Serial '${cleanedSerial}' already exists` };
  
  await pool.query("UPDATE product_serials SET serial_number = ? WHERE id = ?", [cleanedSerial, serialId]);
  return { id: serialId, oldSerial: existing[0].serial_number, newSerial: cleanedSerial };
};

const checkSerialAvailability = async (serial) => {
  const cleanedSerial = serial.trim().toUpperCase();
  const [rows] = await pool.query(
    `SELECT
        ps.id, ps.product_id, p.name as product_name, ps.status,
        ps.base_warranty_months, ps.is_legacy, ps.batch_number, ps.notes,
        c.name as category_name
     FROM product_serials ps
     JOIN products p ON ps.product_id = p.id
     JOIN categories c ON p.category_id = c.id
     WHERE ps.serial_number = ?`,
    [cleanedSerial]
  );
  
  return {
    available: rows.length > 0 && rows[0].status === 'available',
    exists: rows.length > 0,
    details: rows.length > 0 ? rows[0] : null,
  };
};

const getProductSerialStats = async (productId) => {
  let sql = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
      SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END) as sold,
      SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as registered,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked,
      COUNT(*) as total_serials,
      SUM(CASE WHEN status = 'registered' THEN 1 ELSE 0 END) as used_serials,
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_serials
    FROM product_serials
  `;
  const params = [];
  if (productId) {
    sql += " WHERE product_id = ?";
    params.push(productId);
  }
  const [stats] = await pool.query(sql, params);
  return stats[0];
};

const deleteSerialBatch = async (batchNumber) => {
  if (!batchNumber) throw { status: 400, message: "Batch number is required" };
  
  const [registered] = await pool.query(
    "SELECT COUNT(*) as count FROM product_serials WHERE batch_number = ? AND status = 'registered'",
    [batchNumber]
  );
  if (registered[0].count > 0) {
    throw { status: 409, message: `Cannot delete batch '${batchNumber}' - it contains active warranty registrations` };
  }

  const [result] = await pool.query("DELETE FROM product_serials WHERE batch_number = ?", [batchNumber]);
  return { deletedCount: result.affectedRows };
};

// Run migration on module load (safe, idempotent)
initSerialTable().catch((e) => console.error('serialModel migration error:', e));

module.exports = {
  getProductSerials,
  addProductSerials,
  deleteProductSerial,
  updateProductSerial,
  checkSerialAvailability,
  getProductSerialStats,
  getAllSerials,
  deleteSerialBatch,
  createSerialTable,
  initSerialTable
};
