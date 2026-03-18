const pool = require('../config/db');

const createOrdersTables = async () => {
  // 1. Create the base tables (if they don't exist at all)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      address_snapshot JSON NOT NULL,
      delivery_type ENUM('standard','express') DEFAULT 'standard',
      payment_mode ENUM('COD','online') DEFAULT 'COD',
      status ENUM('pending','confirmed','packed','shipped','delivered','cancelled','returned') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      product_id INT,
      name VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      quantity INT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    )
  `);

  // 2. Safe Column Additions (Patches missing columns dynamically)
  const addCol = async (table, sql) => {
    try { await pool.query(`ALTER TABLE ${table} ADD COLUMN ${sql}`); } catch (e) {}
  };

  // Patch missing columns in 'orders'
  await addCol("orders", "subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER user_id");
  await addCol("orders", "discount DECIMAL(10,2) DEFAULT 0 AFTER subtotal");
  await addCol("orders", "total DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount");
  await addCol("orders", "coupon_code VARCHAR(50) AFTER total");
  await addCol("orders", "payment_status ENUM('pending','paid','failed','refunded') DEFAULT 'pending' AFTER payment_mode");
  await addCol("orders", "payment_id VARCHAR(255) AFTER payment_status");
  await addCol("orders", "cancel_reason TEXT AFTER status");
  await addCol("orders", "notes TEXT AFTER cancel_reason");

  try {
    await pool.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending','confirmed','packed','shipped','delivered','cancelled','returned') DEFAULT 'pending'");
  } catch(e) {}

  // Patch missing columns in 'order_items'
  await addCol("order_items", "sku VARCHAR(100) AFTER name");
  await addCol("order_items", "image VARCHAR(500) AFTER quantity");
};

// REWRITTEN FOR E-COMMERCE SECURITY: Creates order safely inside an Inventory-Locking Transaction
const createOrder = async (userId, { items, discount, couponCode, addressSnapshot, deliveryType, paymentMode, notes }) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    let backendSubtotal = 0;
    const processedItems = [];

    // Step 1: Securely Fetch Prices & Deduct Inventory (Blocks concurrent checkout races)
    for (const item of items) {
      const productId = item.product_id || item.id;
      const requestedQty = item.quantity || 1;

      // FOR UPDATE locks the row so no one else can buy it at this exact millisecond
      const [[dbProduct]] = await conn.query(
        'SELECT name, sku, price, discount_price, quantity FROM products WHERE id = ? FOR UPDATE', 
        [productId]
      );
      
      if (!dbProduct) throw new Error(`Product ID ${productId} not found.`);
      if (dbProduct.quantity < requestedQty) throw new Error(`Insufficient stock for ${dbProduct.name}. Only ${dbProduct.quantity} left.`);

      // Step 2: Calculate True Backend Price
      const unitPrice = (dbProduct.discount_price && dbProduct.discount_price > 0) ? dbProduct.discount_price : dbProduct.price;
      backendSubtotal += (unitPrice * requestedQty);

      // Step 3: Deduct Inventory immediately
      await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [requestedQty, productId]);

      // Handle item image mapping
      let itemImage = item.image || item.images || null;
      if (Array.isArray(itemImage)) itemImage = itemImage[0];
      else if (typeof itemImage === 'string' && itemImage.startsWith('[')) {
        try { itemImage = JSON.parse(itemImage)[0]; } catch(e){}
      }

      processedItems.push({
        product_id: productId,
        name: dbProduct.name,
        sku: dbProduct.sku,
        price: unitPrice,
        quantity: requestedQty,
        image: itemImage
      });
    }

    // Step 4: Finalize Totals Safely (Prevents frontend tampering)
    const safeDiscount = discount || 0; 
    const backendTotal = Math.max(0, backendSubtotal - safeDiscount);

    // Step 5: Insert the Order
    const [res] = await conn.query(
      `INSERT INTO orders (user_id, subtotal, discount, total, coupon_code, address_snapshot, delivery_type, payment_mode, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, backendSubtotal, safeDiscount, backendTotal, couponCode || null,
       JSON.stringify(addressSnapshot), deliveryType || 'standard',
       paymentMode || 'COD', notes || null]
    );
    
    const orderId = res.insertId;
    
    // Step 6: Insert Order Items
    for (const pItem of processedItems) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, name, sku, price, quantity, image)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, pItem.product_id, pItem.name, pItem.sku, pItem.price, pItem.quantity, pItem.image]
      );
    }
    
    // Commit the entire transaction
    await conn.commit();
    return orderId;
  } catch (e) {
    // If anything fails (e.g. out of stock), reverse everything (inventory deduction etc.)
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const parseOrder = (o) => ({
  ...o,
  address_snapshot: typeof o.address_snapshot === 'string'
    ? JSON.parse(o.address_snapshot)
    : o.address_snapshot,
});

const getOrdersByUser = async (userId) => {
  const [orders] = await pool.query('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC', [userId]);
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
  }
  return orders.map(parseOrder);
};

const getOrderById = async (orderId) => {
  const [[order]] = await pool.query('SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) return null;
  const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
  order.items = items;
  return parseOrder(order);
};

const getAllOrders = async ({ status, userId } = {}) => {
  let sql = `SELECT o.*, u.name as customer_name, u.email as customer_email
             FROM orders o JOIN users u ON u.id = o.user_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status=?'; params.push(status); }
  if (userId) { sql += ' AND o.user_id=?'; params.push(userId); }
  sql += ' ORDER BY o.created_at DESC';
  const [orders] = await pool.query(sql, params);
  for (const o of orders) {
    const [items] = await pool.query('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    o.items = items;
  }
  return orders.map(parseOrder);
};

const updateOrderStatus = async (orderId, status, cancelReason) => {
  // Inventory Restock Logic on Cancellation
  if (status === 'cancelled' || status === 'returned') {
     const conn = await pool.getConnection();
     try {
       await conn.beginTransaction();
       
       // Update the status
       if (cancelReason) {
         await conn.query('UPDATE orders SET status=?, cancel_reason=? WHERE id=?', [status, cancelReason, orderId]);
       } else {
         await conn.query('UPDATE orders SET status=? WHERE id=?', [status, orderId]);
       }

       // Restock products
       const [items] = await conn.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId]);
       for (const item of items) {
           await conn.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
       }
       
       await conn.commit();
     } catch (err) {
       await conn.rollback();
       throw err;
     } finally {
       conn.release();
     }
  } else {
    // Normal status update
    await pool.query('UPDATE orders SET status=? WHERE id=?', [status, orderId]);
  }
};

const updatePaymentStatus = async (orderId, paymentStatus, paymentId) => {
  await pool.query(
    'UPDATE orders SET payment_status=?, payment_id=? WHERE id=?',
    [paymentStatus, paymentId || null, orderId]
  );
};

module.exports = {
  createOrder, getOrdersByUser, getAllOrders, getOrderById, updateOrderStatus, updatePaymentStatus, createOrdersTables,
};
