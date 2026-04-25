const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateAdmin } = require('../middleware/authMiddleware');

// Shared analytics handler
const getDashboardData = async (req, res) => {
  try {
    const period = req.query.period || '30d';
    let days = 30;
    if (period === '7d') days = 7;
    if (period === '90d') days = 90;

    const [salesData] = await db.execute(`
      SELECT DATE(created_at) as period,
        COUNT(*) as orders,
        SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as revenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY period ASC
    `, [days]);

    const [totalStats] = await db.execute(`
      SELECT
        COUNT(*) as totalOrders,
        SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END) as totalRevenue
      FROM orders
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    const [userStats] = await db.execute(`
      SELECT COUNT(*) as newUsers
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `, [days]);

    const [productStats] = await db.execute(`
      SELECT COUNT(*) as totalProducts FROM products WHERE status = 'active'
    `);

    const [pendingOrders] = await db.execute(`
      SELECT COUNT(*) as pending FROM orders WHERE status = 'pending'
    `);

    res.json({
      chartData: salesData,
      metrics: {
        revenue: totalStats[0].totalRevenue || 0,
        orders: totalStats[0].totalOrders || 0,
        newCustomers: userStats[0].newUsers || 0,
        avgOrderValue: totalStats[0].totalOrders > 0
          ? (totalStats[0].totalRevenue / totalStats[0].totalOrders).toFixed(2)
          : 0,
        totalProducts: productStats[0].totalProducts || 0,
        pendingOrders: pendingOrders[0].pending || 0
      }
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
};

// Both routes point to same handler
router.get('/kpis', authenticateAdmin, getDashboardData);
router.get('/dashboard', authenticateAdmin, getDashboardData);
router.get('/sales', authenticateAdmin, getDashboardData);
router.get('/products', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT p.id, p.name, p.price, p.discount_price, p.quantity,
        p.rating, p.review_count, p.status, c.name as category_name,
        COUNT(oi.id) as total_sold
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 20
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch product analytics' });
  }
});

module.exports = router;
