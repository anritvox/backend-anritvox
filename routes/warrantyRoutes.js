const express = require('express');
const pool = require('../config/db');
const { authenticateUser, authenticateAdmin } = require('../middleware/authMiddleware');

// Import the existing schema-accurate logic from the model
const { 
  validateSerial, 
  registerWarranty, 
  getAllRegistrations, 
  updateWarrantyStatus 
} = require('../models/warrantyModel');

const router = express.Router();

// ============================================================================
// PHASE 1: PRESERVED WAREHOUSE ROUTES (Zero Regressions)
// ============================================================================

router.get('/state', authenticateUser, async (req, res) => {
  try {
    const uid = req.user.id;
    const [inv] = await pool.query('SELECT * FROM warehouse_inventory WHERE user_id=?', [uid]);
    const [cust] = await pool.query('SELECT * FROM warehouse_customers WHERE user_id=?', [uid]);
    const [sales] = await pool.query('SELECT * FROM warehouse_sales WHERE user_id=?', [uid]);
    const [state] = await pool.query('SELECT * FROM warehouse_cloud_state WHERE user_id=?', [uid]);

    const avState = {
      i: inv.map(x => ({ id: x.id, name: x.name, cat: x.category, qty: x.quantity, price: parseFloat(x.sell_price), dateAdded: x.date_added, soldQty: x.sold_qty })),
      c: cust.map(x => ({ id: x.id, name: x.name, phone: x.phone, loc: x.loc, type: x.type, wallet: parseFloat(x.wallet) })),
      s: sales.map(x => JSON.parse(x.sale_json)),
      l: state.length > 0 && state[0].logs_json ? JSON.parse(state[0].logs_json) : [],
      p: state.length > 0 && state[0].proofs_json ? JSON.parse(state[0].proofs_json) : [],
      cfg: state.length > 0 && state[0].cfg_json ? JSON.parse(state[0].cfg_json) : { cats: ['General'], hid: [], auth: {} }
    };

    res.json({ success: true, state: avState });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.post('/sync', authenticateUser, async (req, res) => {
  const uid = req.user.id;
  const { i, c, s, p, l, cfg } = req.body;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    if (i && i.length) {
      const invIds = i.map(item => item.id);
      if(invIds.length > 0) await conn.query(`DELETE FROM warehouse_inventory WHERE user_id = ? AND id NOT IN (?)`, [uid, invIds]);
      for (const item of i) {
        await conn.query(`
          INSERT INTO warehouse_inventory (id, user_id, name, category, quantity, sell_price, date_added, sold_qty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name), category=VALUES(category), quantity=VALUES(quantity), sell_price=VALUES(sell_price), sold_qty=VALUES(sold_qty)
        `, [item.id, uid, item.name, item.cat, item.qty, item.price, new Date(item.dateAdded), item.soldQty || 0]);
      }
    } else {
        await conn.query(`DELETE FROM warehouse_inventory WHERE user_id = ?`, [uid]);
    }

    if (c && c.length) {
      const custIds = c.map(cust => cust.id);
      if(custIds.length > 0) await conn.query(`DELETE FROM warehouse_customers WHERE user_id = ? AND id NOT IN (?)`, [uid, custIds]);
      for (const cust of c) {
        await conn.query(`
          INSERT INTO warehouse_customers (id, user_id, name, phone, loc, type, wallet)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), loc=VALUES(loc), type=VALUES(type), wallet=VALUES(wallet)
        `, [cust.id, uid, cust.name, cust.phone, cust.loc, cust.type, cust.wallet]);
      }
    } else {
        await conn.query(`DELETE FROM warehouse_customers WHERE user_id = ?`, [uid]);
    }

    if (s && s.length) {
      const saleIds = s.map(sale => sale.id);
      if(saleIds.length > 0) await conn.query(`DELETE FROM warehouse_sales WHERE user_id = ? AND id NOT IN (?)`, [uid, saleIds]);
      for (const sale of s) {
        await conn.query(`
          INSERT INTO warehouse_sales (id, user_id, date, customer_id, total, paid, sale_json)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE sale_json=VALUES(sale_json)
        `, [sale.id, uid, new Date(sale.date), sale.cust.id, sale.billTotal || sale.total, sale.paid || 0, JSON.stringify(sale)]);
      }
    } else {
        await conn.query(`DELETE FROM warehouse_sales WHERE user_id = ?`, [uid]);
    }

    await conn.query(`
      INSERT INTO warehouse_cloud_state (user_id, logs_json, proofs_json, cfg_json)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE logs_json=VALUES(logs_json), proofs_json=VALUES(proofs_json), cfg_json=VALUES(cfg_json)
    `, [uid, JSON.stringify(l), JSON.stringify(p), JSON.stringify(cfg)]);

    await conn.commit();
    res.json({ success: true });
  } catch(err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ============================================================================
// PHASE 2: E-WARRANTY INTEGRATION (Schema-Mapped via Model)
// ============================================================================

// 1. Validate Serial & Fetch Data (Routing straight to warrantyModel)
router.get('/validate/:serial', async (req, res) => {
  try {
    const data = await validateSerial(req.params.serial);
    res.json(data);
  } catch (error) {
    console.error("Validation Error: ", error);
    res.status(error.status || 500).json({ message: error.message || 'Server error validating serial number.' });
  }
});

// 2. Register New Warranty
router.post('/register', async (req, res) => {
  try {
    const result = await registerWarranty(req.body);
    res.json({ success: true, ...result, message: 'Warranty activated successfully.' });
  } catch (error) {
    console.error("Registration Error: ", error);
    res.status(error.status || 500).json({ message: error.message || 'Registration failed. Please try again.' });
  }
});

// 3. Get Logged-in User Warranties
router.get('/my', authenticateUser, async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT wr.*, p.name as product_name, p.images 
            FROM warranty_registrations wr
            JOIN products p ON wr.product_id = p.id
            WHERE wr.user_email = (SELECT email FROM users WHERE id = ?) OR wr.user_phone = (SELECT phone FROM users WHERE id = ?)
        `, [req.user.id, req.user.id]);
        res.json({ success: true, warranties: rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 4. Admin: Fetch All
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const rows = await getAllRegistrations();
        res.json({ success: true, warranties: rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// 5. Admin: Update Status
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
    try {
        await updateWarrantyStatus(req.params.id, req.body.status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
