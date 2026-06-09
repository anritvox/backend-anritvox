const express = require('express');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { authenticateUser, authenticateAdmin, isWarehouseAdmin } = require('../middleware/authMiddleware');
const { restoreLegacyBackup, logWalkinSale } = require('../models/warehouseModel');

const router = express.Router();
const auth = authenticateUser;
const adminAuth = authenticateAdmin;

const deepParseState = (data) => {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            if (typeof parsed === 'object' && parsed !== null) {
                return deepParseState(parsed);
            }
        } catch (e) {
            return data;
        }
    }
    if (Array.isArray(data)) return data.map(item => deepParseState(item));
    if (typeof data === 'object' && data !== null) {
        const parsedObj = {};
        for (const key in data) parsedObj[key] = deepParseState(data[key]);
        return parsedObj;
    }
    return data;
};

const findItemsArray = (state, isSales) => {
  if (!state || typeof state !== 'object') return [];
  if (!isSales) {
    if (state.AV?.d?.i && Array.isArray(state.AV.d.i)) return state.AV.d.i;
    if (state.i && Array.isArray(state.i)) return state.i;
  } else {
    if (state.AV?.d?.s && Array.isArray(state.AV.d.s)) return state.AV.d.s;
    if (state.s && Array.isArray(state.s)) return state.s;
  }
  
  let found = [];
  const scan = (obj) => {
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
        const first = obj[0];
        const hasName = ('n' in first || 'name' in first || 'product_name' in first);
        const hasTime = ('t' in first || 'timestamp' in first || 'date' in first || 'sold_at' in first || 'created_at' in first);
        
        if (hasName) {
           if (isSales && hasTime && found.length === 0) found = obj;
           if (!isSales && !hasTime && found.length === 0) found = obj;
        }
      }
      return;
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) scan(obj[key]);
    }
  };
  scan(state);
  return found;
};

router.get('/check-access', auth, isWarehouseAdmin, async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store,no-cache,must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        if (req.user.role === 'superadmin' || req.user.role === 'admin') {
            return res.json({ success: true, hasAccess: true, isAdmin: true, storeName: 'Global Administrator' });
        }
        const [rows] = await pool.query('SELECT is_active, store_name FROM warehouse_access WHERE user_id = ?', [req.user.id]);
        const hasAccess = rows.length > 0 && parseInt(rows[0].is_active) === 1;
        res.json({ success: true, hasAccess, isAdmin: false, storeName: hasAccess ? rows[0].store_name : null });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/state', auth, isWarehouseAdmin, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT app_state FROM warehouse_user_states WHERE user_id=?', [req.user.id]);
        res.json(rows.length > 0 && rows[0].app_state ? { success: true, state: deepParseState(rows[0].app_state) } : { success: true, state: null });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

router.post('/sync', auth, isWarehouseAdmin, async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO warehouse_user_states (user_id, app_state) VALUES (?, ?) ON DUPLICATE KEY UPDATE app_state=VALUES(app_state)',
            [req.user.id, JSON.stringify(req.body)]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/log-sale', auth, isWarehouseAdmin, async (req, res) => {
    try {
        const { product_name, quantity, sale_price } = req.body;
        if (!product_name) return res.status(400).json({ message: 'product_name required' });
        let sn = 'Global Administrator';
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            const [access] = await pool.query('SELECT store_name FROM warehouse_access WHERE user_id=?', [req.user.id]);
            sn = access.length > 0 ? access[0].store_name : 'Unknown';
        }
        await pool.query(
            'INSERT INTO warehouse_sales_log (user_id, store_name, product_name, quantity, sale_price, customer_type) VALUES (?,?,?,?,?,?)',
            [req.user.id, sn, product_name, quantity || 1, sale_price || 0, 'registered']
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/walkin-sale', auth, isWarehouseAdmin, async (req, res) => {
    try {
        let sn = 'Global Administrator';
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            const [a] = await pool.query('SELECT store_name FROM warehouse_access WHERE user_id=?', [req.user.id]);
            sn = a.length > 0 ? a[0].store_name : 'Unknown';
        }
        const id = await logWalkinSale({ ...req.body, uid: req.user.id, sn });
        res.json({ success: true, id, message: 'Walk-in transaction complete' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

router.post('/restore-legacy', auth, isWarehouseAdmin, async (req, res) => {
    try {
        let sn = 'Global Administrator';
        if (req.user.role !== 'superadmin' && req.user.role !== 'admin') {
            const [a] = await pool.query('SELECT store_name FROM warehouse_access WHERE user_id=?', [req.user.id]);
            sn = a.length > 0 ? a[0].store_name : 'Unknown';
        }
        const ok = await restoreLegacyBackup(req.body.backupData, req.user.id, sn);
        res.json({ success: ok, message: 'Legacy ledger merged successfully' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/admin/users', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT wa.id, wa.user_id, u.name, u.email, u.role, u.wallet_balance, u.is_active as user_status, wa.store_name, wa.is_active, wa.granted_at, (SELECT COUNT(*) FROM warehouse_sales_log wsl WHERE wsl.user_id = wa.user_id) as total_sales FROM warehouse_access wa JOIN users u ON u.id = wa.user_id ORDER BY wa.granted_at DESC'
        );
        res.json({ success: true, users: rows });
    } catch (e) {
        res.json({ success: false, users: [], message: e.message }); 
    }
});

// Current API Endpoint
router.get('/admin/retrieve-data/:user_id', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT app_state FROM warehouse_user_states WHERE user_id = ?', [req.params.user_id]);
        if (rows.length === 0) return res.json({ success: true, app_state: null });
        res.json({ success: true, app_state: rows[0].app_state });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// BACKWARD COMPATIBILITY ALIAS: Guarantees active cached Vercel chunks continue to function
router.get('/admin/retrieve-node/:user_id', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT app_state FROM warehouse_user_states WHERE user_id = ?', [req.params.user_id]);
        if (rows.length === 0) return res.json({ success: true, app_state: null });
        res.json({ success: true, app_state: rows[0].app_state });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

router.get('/admin/inventory', adminAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT wus.user_id, u.name as distributor_name, wa.store_name, wus.app_state, wus.updated_at 
      FROM warehouse_user_states wus
      JOIN users u ON u.id = wus.user_id
      LEFT JOIN warehouse_access wa ON wa.user_id = wus.user_id
    `);
    
    const inventory = [];
    for (const row of rows) {
      try {
        if (row.app_state) {
          const state = deepParseState(row.app_state);
          const items = findItemsArray(state, false);
          
          for (const item of items) {
            inventory.push({
              user_id: row.user_id,
              distributor_name: row.distributor_name,
              store_name: row.store_name || 'Unknown',
              item_id: item.id || item.i || null,
              product_name: item.n || item.name || item.product_name || 'Unknown Product',
              quantity: item.q || item.quantity || item.qty || 0,
              unit: item.u || item.unit || 'units',
              cost_price: item.c || item.cost || item.cost_price || 0,
              sale_price: item.p || item.price || item.sale_price || 0,
              last_updated: row.updated_at
            });
          }
        }
      } catch (parseErr) {}
    }
    
    res.json({ success: true, inventory });
  } catch (e) {
    res.json({ success: false, inventory: [], message: e.message });
  }
});

router.put('/admin/user-deep-edit/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, password, store_name, wallet_balance, role, is_active } = req.body;
        
        let userQuery = 'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email)';
        let userParams = [name, email];

        if (wallet_balance !== undefined && wallet_balance !== '') {
            userQuery += ', wallet_balance = ?';
            userParams.push(wallet_balance);
        }
        if (role) {
            userQuery += ', role = ?';
            userParams.push(role);
        }
        if (is_active !== undefined) {
            userQuery += ', is_active = ?';
            userParams.push(is_active);
        }
        
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            userQuery += ', password_hash = ?';
            userParams.push(hashedPassword);
        }

        userQuery += ' WHERE id = ?';
        userParams.push(id);

        await pool.query(userQuery, userParams);

        if (store_name) {
            await pool.query('UPDATE warehouse_access SET store_name = ? WHERE user_id = ?', [store_name, id]);
        }

        res.json({ success: true, message: 'Administrator profile updated successfully.' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

router.get('/admin/sales', adminAuth, async (req, res) => {
  try {    
    const { date, store_user_id } = req.query;
    
    let b = 'SELECT wsl.*, u.name as distributor_name FROM warehouse_sales_log wsl LEFT JOIN users u ON u.id = wsl.user_id';
    let p = [];
    if (date) { b += ' AND DATE(wsl.sold_at) = ?'; p.push(date); }
    if (store_user_id) { b += ' AND wsl.user_id = ?'; p.push(store_user_id); }
    b += ' ORDER BY wsl.sold_at DESC';
    const [loggedSales] = await pool.query(b, p);
    
    const [stateRows] = await pool.query(`
      SELECT wus.user_id, u.name as distributor_name, wa.store_name, wus.app_state 
      FROM warehouse_user_states wus
      JOIN users u ON u.id = wus.user_id
      LEFT JOIN warehouse_access wa ON wa.user_id = wus.user_id
      ${ store_user_id ? 'WHERE wus.user_id = ?' : '' }
    `, store_user_id ? [store_user_id] : []);
    
    const stateSales = [];
    for (const row of stateRows) {
      try {
        if (row.app_state) {
          const state = deepParseState(row.app_state);
          const inventory = findItemsArray(state, false);
          const sales = findItemsArray(state, true);
         
          for (const sale of sales) {
            const saleDate = sale.t || sale.timestamp || sale.date || sale.sold_at || sale.created_at;
            
            if (!date || (saleDate && saleDate.startsWith(date))) {
              
              let productName = sale.n || sale.name || sale.product_name;
              if (!productName && (sale.i || sale.item_id)) {
                const matchedItem = inventory.find(inv => inv.i === sale.i || inv.id === sale.item_id || inv.i === sale.item_id);
                if (matchedItem) productName = matchedItem.n || matchedItem.name || matchedItem.product_name;
              }
              
              const qty = sale.q || sale.quantity || sale.qty || 1; 
              const price = sale.p || sale.price || sale.sale_price || (sale.pr ? sale.pr / qty : 0);

              stateSales.push({
                user_id: row.user_id,
                distributor_name: row.distributor_name,
                store_name: row.store_name || 'Unknown',
                product_name: productName || 'Unknown Product',
                quantity: qty,
                sale_price: price,
                customer_type: sale.ct || sale.customer_type || 'unknown',
                sold_at: saleDate || new Date().toISOString(),
                source: 'app_state'
              });
            }
          }
        }
      } catch (parseErr) {}
    }
    
    const allSales = [...loggedSales.map(s => ({...s, source: 'database'})), ...stateSales];
    res.json({ success: true, sales: allSales });
  } catch (e) {
    res.json({ success: false, sales: [], message: e.message });
  }
});

router.get('/admin/sales-summary', adminAuth, async (req, res) => {
    try {
        const { date, store_user_id } = req.query;
        let q = 'SELECT product_name, store_name, SUM(quantity) as total_qty, SUM(quantity * sale_price) as total_revenue, COUNT(*) as transactions FROM warehouse_sales_log WHERE 1=1';
        let p = [];
        if (date) { q += ' AND DATE(sold_at) = ?'; p.push(date); }
        if (store_user_id) { q += ' AND user_id = ?'; p.push(store_user_id); }
        q += ' GROUP BY product_name, store_name ORDER BY total_qty DESC';
        const [rows] = await pool.query(q, p);
        res.json({ success: true, summary: rows });
    } catch (e) {
        res.json({ success: false, summary: [], message: e.message }); 
    }
});

router.post('/admin/add-user', adminAuth, async (req, res) => {
  try {
    const { name, email, password, store_name, role, wallet_balance } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }
    
    const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, wallet_balance, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'customer', wallet_balance || 0, 1]
    );
    
    const newUserId = result.insertId;
    
    if (store_name && store_name.trim() !== '') {
      await pool.query(
        'INSERT INTO warehouse_access (user_id, store_name, is_active) VALUES (?, ?, ?)',
        [newUserId, store_name, 1]
      );
    }
    
    res.json({ success: true, message: 'User created successfully.', user_id: newUserId });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/admin/user/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM warehouse_access WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM warehouse_user_states WHERE user_id = ?', [id]);
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/admin/toggle-status/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [is_active, id]);
    res.json({ success: true, message: 'User status updated successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/admin/wallet-adjust/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { adjustment } = req.body;
    
    if (typeof adjustment !== 'number' || isNaN(adjustment)) {
      return res.status(400).json({ success: false, message: 'Invalid adjustment amount.' });
    }
    
    const [user] = await pool.query('SELECT wallet_balance FROM users WHERE id = ?', [id]);
    if (user.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    
    const currentBalance = parseFloat(user[0].wallet_balance) || 0;
    const newBalance = currentBalance + adjustment;
    
    if (newBalance < 0) {
      return res.status(400).json({ success: false, message: 'Insufficient balance. Cannot go negative.' });
    }
    
    await pool.query('UPDATE users SET wallet_balance = ? WHERE id = ?', [newBalance, id]);
    res.json({ success: true, message: 'Wallet adjusted successfully.', new_balance: newBalance });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/admin/grant-access', adminAuth, async (req, res) => {
  try {
    const { user_id, store_name } = req.body;
    if (!user_id || !store_name) return res.status(400).json({ success: false, message: 'user_id and store_name are required.' });
    
    const [user] = await pool.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (user.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    
    const [existing] = await pool.query('SELECT id FROM warehouse_access WHERE user_id = ?', [user_id]);
    if (existing.length > 0) {
      await pool.query('UPDATE warehouse_access SET store_name = ?, is_active = 1 WHERE user_id = ?', [store_name, user_id]);
    } else {
      await pool.query('INSERT INTO warehouse_access (user_id, store_name, is_active) VALUES (?, ?, ?)', [user_id, store_name, 1]);
    }
    
    res.json({ success: true, message: 'Warehouse access granted successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.delete('/admin/revoke-access/:user_id', adminAuth, async (req, res) => {
  try {
    const { user_id } = req.params;
    await pool.query('DELETE FROM warehouse_access WHERE user_id = ?', [user_id]);
    await pool.query('DELETE FROM warehouse_user_states WHERE user_id = ?', [user_id]);
    res.json({ success: true, message: 'Warehouse access revoked successfully.' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/admin/activity-log', adminAuth, async (req, res) => {
  try {
    const [tables] = await pool.query("SHOW TABLES LIKE 'activity_log'");
    if (tables.length === 0) {
      return res.json({ success: true, logs: [], message: 'Activity log table not yet created. Run migration to enable audit logging.' });
    }
    const [logs] = await pool.query('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 100');
    res.json({ success: true, logs });
  } catch (e) {
    res.json({ success: false, logs: [], message: e.message });
  }
});

module.exports = router;
