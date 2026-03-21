const pool = require('../config/db');

/**
 * Creates the coupons table with support for complex rules stored as JSON.
 */
const createCouponTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      discount_type ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(10,2) NOT NULL,
      min_order_amount DECIMAL(10,2) DEFAULT 0,
      max_discount DECIMAL(10,2) DEFAULT NULL,
      usage_limit INT DEFAULT NULL,
      used_count INT DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      rules_json TEXT DEFAULT NULL,
      expires_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/**
 * Inserts a new coupon. rules_json should be passed as a stringified object.
 */
const createCoupon = async (data) => {
  const { 
    code, 
    discount_type, 
    discount_value, 
    min_order_amount, 
    max_discount, 
    usage_limit, 
    expires_at,
    rules_json 
  } = data;

  const [result] = await pool.query(
    `INSERT INTO coupons 
    (code, discount_type, discount_value, min_order_amount, max_discount, usage_limit, expires_at, rules_json) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      code.toUpperCase(), 
      discount_type, 
      discount_value, 
      min_order_amount || 0, 
      max_discount || null, 
      usage_limit || null, 
      expires_at || null,
      rules_json || '{}'
    ]
  );
  return result.insertId;
};

const getCouponByCode = async (code) => {
  const [rows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code.toUpperCase()]);
  return rows[0];
};

const getAllCoupons = async () => {
  const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
  return rows;
};

const updateCoupon = async (id, data) => {
  const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(data), id];
  await pool.query(`UPDATE coupons SET ${fields} WHERE id = ?`, values);
};

const deleteCoupon = async (id) => {
  await pool.query('DELETE FROM coupons WHERE id = ?', [id]);
};

const incrementCouponUsage = async (code) => {
  await pool.query('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [code.toUpperCase()]);
};

/**
 * Integrated validation logic:
 * Checks basic constraints (expiry, active, usage) and complex rules (categories, SKUs).
 */
const validateCoupon = async (code, cartItems) => {
  const coupon = await getCouponByCode(code);

  // 1. Basic Availability Checks
  if (!coupon) return { valid: false, message: 'Invalid coupon code' };
  if (!coupon.is_active) return { valid: false, message: 'Coupon is not active' };
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, message: 'Coupon has expired' };
  }
  if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }

  // 2. Complex Rule Parsing
  const rules = JSON.parse(coupon.rules_json || '{}');
  let eligibleTotal = 0;

  for (const item of cartItems) {
    // Check if category matches (if rule exists)
    if (rules.category_id && item.category_id !== rules.category_id) continue;
    // Check if SKU is excluded (if rule exists)
    if (rules.excluded_skus && rules.excluded_skus.includes(item.sku)) continue;
    
    eligibleTotal += item.price * item.quantity;
  }

  // 3. Minimum Spend Check (on eligible items only)
  if (eligibleTotal < coupon.min_order_amount) {
    const diff = (coupon.min_order_amount - eligibleTotal).toFixed(2);
    return { 
      valid: false, 
      message: `Add $${diff} more in eligible items to use this coupon` 
    };
  }

  // 4. Discount Calculation
  let discount = coupon.discount_type === 'percentage'
    ? (eligibleTotal * coupon.discount_value) / 100
    : coupon.discount_value;

  // Apply maximum discount cap
  if (coupon.max_discount) {
    discount = Math.min(discount, coupon.max_discount);
  }

  return { 
    valid: true, 
    discount: parseFloat(discount.toFixed(2)), 
    coupon 
  };
};

module.exports = { 
  createCouponTable, 
  createCoupon, 
  getCouponByCode, 
  getAllCoupons, 
  updateCoupon, 
  deleteCoupon, 
  incrementCouponUsage, 
  validateCoupon 
};
