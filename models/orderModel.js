const pool = require('../config/db');
const { adjustWallet } = require('./userModel');

const createOrder = async ({
  userId,
  items,
  discount,
  couponCode,
  addressSnapshot,
  deliveryType,
  paymentMode,
  notes
}) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let backendSubtotal = 0;
    const processedItems = [];

    // 1. Validate Stock and Calculate Subtotal
    for (const item of items) {
      const productId = item.product_id || item.id;
      const [dbProducts] = await conn.query(
        'SELECT name, sku, price, discount_price, quantity FROM products WHERE id = ? FOR UPDATE',
        [productId]
      );
      const dbProduct = dbProducts[0];
      if (!dbProduct) throw new Error(`Product ID ${productId} not found.`);

      const requestedQty = parseInt(item.quantity || 1, 10);
      if (dbProduct.quantity < requestedQty) throw new Error(`Insufficient stock for ${dbProduct.name}.`);

      const unitPrice = (dbProduct.discount_price > 0) ? dbProduct.discount_price : dbProduct.price;
      backendSubtotal += (unitPrice * requestedQty);

      await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [requestedQty, productId]);
      processedItems.push({ product_id: productId, name: dbProduct.name, price: unitPrice, quantity: requestedQty });
    }

    const shippingCharge = deliveryType === 'express' ? 99 : 0;
    const backendTotal = Math.max(0, backendSubtotal + shippingCharge - parseFloat(discount || 0));

    // 2. Handle Wallet Payment
    if (paymentMode === 'WALLET') {
      await adjustWallet(conn, userId, backendTotal, 'debit', `Order Payment`, null);
    }

    // 3. Create Order Record
    const [res] = await conn.query(
      `INSERT INTO orders (user_id, subtotal, discount, total, coupon_code, address_snapshot, delivery_type, payment_mode, notes, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, backendSubtotal, discount, backendTotal, couponCode, JSON.stringify(addressSnapshot), deliveryType, paymentMode, notes, paymentMode === 'WALLET' ? 'paid' : 'pending']
    );

    const orderId = res.insertId;

    // 4. Insert Order Items
    for (const pItem of processedItems) {
      await conn.query(`INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?,?,?,?,?)`,
        [orderId, pItem.product_id, pItem.name, pItem.price, pItem.quantity]);
    }

    // --- 5. LOYALTY LOGIC (NEW) ---
    const pointsEarned = Math.floor(backendTotal / 100);

    // Update user points, total spend, and dynamic tiering
    await conn.query(
      `UPDATE users 
       SET loyalty_points = loyalty_points + ?, 
           total_spent = total_spent + ?,
           membership_tier = CASE 
             WHEN (total_spent + ?) >= 100000 THEN 'platinum'
             WHEN (total_spent + ?) >= 50000 THEN 'gold'
             WHEN (total_spent + ?) >= 10000 THEN 'silver'
             ELSE 'bronze'
           END
       WHERE id = ?`,
      [pointsEarned, backendTotal, backendTotal, backendTotal, backendTotal, userId]
    );

    // Notify user of points earned
    if (pointsEarned > 0) {
      await conn.query(
        'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
        [userId, `You earned ${pointsEarned} Anritvox Points! Check out your new tier status.`]
      );
    }

    await conn.commit();
    return orderId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { createOrder };
