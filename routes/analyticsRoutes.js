// backend/routes/analyticsRoutes
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// GET /api/analytics/dashboard - admin: full dashboard stats
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Revenue & orders stats
    const [[orderStats]] = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status NOT IN ('cancelled') THEN total_price ELSE 0 END) as total_revenue,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as orders_today,
        SUM(CASE WHEN DATE(created_at) = CURDATE() AND status NOT IN ('cancelled') THEN total_price ELSE 0 END) as revenue_today,
        SUM(CASE WHEN WEEK(created_at) = WEEK(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) as orders_this_week,
        SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) as orders_this_month,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
      FROM orders
    `);

    // Users stats
    const [[userStats]] = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as new_users_today,
        SUM(CASE WHEN MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW()) THEN 1 ELSE 0 END) as new_users_this_month
      FROM users
    `);

    // Products stats
    const [[productStats]] = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN stock > 0 AND stock <= 5 THEN 1 ELSE 0 END) as low_stock
      FROM products
    `);

    // Top 5 best selling products
    const [topProducts] = await pool.query(`
      SELECT p.id, p.name, p.price, p.images,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled'
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 5
    `);

    // Revenue by month (last 6 months)
    const [monthlyRevenue] = await pool.query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as orders,
        SUM(CASE WHEN status != 'cancelled' THEN total_price ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // Recent 10 orders
    const [recentOrders] = await pool.query(`
      SELECT o.id, o.status, o.total_price, o.created_at, u.name as user_name, u.email
      FROM orders o JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC LIMIT 10
    `);

    res.json({
      orders: orderStats,
      users: userStats,
      products: productStats,
      topProducts,
      monthlyRevenue,
      recentOrders
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get analytics' });
  }
});

// GET /api/analytics/revenue?period=daily|weekly|monthly - revenue chart data
router.get('/revenue', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    let groupBy, interval;
    if (period === 'monthly') { groupBy = "DATE_FORMAT(created_at, '%Y-%m')"; interval = '12 MONTH'; }
    else if (period === 'weekly') { groupBy = "YEARWEEK(created_at)"; interval = '12 WEEK'; }
    else { groupBy = "DATE(created_at)"; interval = '30 DAY'; }
    const [rows] = await pool.query(`
      SELECT ${groupBy} as period,
        COUNT(*) as orders,
        SUM(CASE WHEN status != 'cancelled' THEN total_price ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get revenue data' });
  }
});
// FIXED: Handle frontend requests asking for base analytics without the /revenue path
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    let groupBy, interval;
    
    if (period === 'monthly') { groupBy = "DATE_FORMAT(created_at, '%Y-%m')"; interval = '12 MONTH'; }
    else if (period === 'weekly') { groupBy = "YEARWEEK(created_at)"; interval = '12 WEEK'; }
    else { groupBy = "DATE(created_at)"; interval = '30 DAY'; }
    
    const [rows] = await pool.query(`
      SELECT ${groupBy} as period,
        COUNT(*) as orders,
        SUM(CASE WHEN status != 'cancelled' THEN total_price ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})
      GROUP BY ${groupBy}
      ORDER BY period ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get revenue data' });
  }
});
module.exports = router;
