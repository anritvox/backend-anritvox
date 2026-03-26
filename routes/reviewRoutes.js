// backend/routes/reviewRoutes
const express = require('express');
const router = express.Router();
const { authenticateUser, authenticateAdmin } = require('../middleware/authMiddleware');
const { createReview, getReviewsByProduct, getProductRatingSummary, getAllReviews, approveReview, rejectReview, getUserReviews } = require('../models/reviewModel');

// GET /api/reviews/product/:productId - public: approved reviews + rating summary
router.get('/product/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const [reviews, summary] = await Promise.all([
      getReviewsByProduct(productId, true),
      getProductRatingSummary(productId)
    ]);
    res.json({ reviews, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get reviews' });
  }
});

// GET /api/reviews/my - user: my reviews
router.get('/my', authenticateUser, async (req, res) => {
  try {
    const reviews = await getUserReviews(req.user.id);
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get reviews' });
  }
});

// POST /api/reviews - user: submit review
router.post('/', authenticateUser, async (req, res) => {
  try {
    const { product_id, order_id, rating, title, body } = req.body;
    if (!product_id || !rating) return res.status(400).json({ message: 'product_id and rating are required' });
    if (rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    const id = await createReview({ product_id, user_id: req.user.id, order_id, rating, title, body });
    res.status(201).json({ message: 'Review submitted and pending approval', id });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'You already reviewed this product for this order' });
    console.error(err);
    res.status(500).json({ message: 'Failed to submit review' });
  }
});

// GET /api/reviews - admin: all reviews (optional ?approved=0 or 1)
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const approved = req.query.approved !== undefined ? parseInt(req.query.approved) : null;
    const reviews = await getAllReviews(approved);
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get reviews' });
  }
});

// PUT /api/reviews/:id/approve - admin: approve review
router.put('/:id/approve', authenticateAdmin, async (req, res) => {
  try {
    await approveReview(req.params.id);
    res.json({ message: 'Review approved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to approve review' });
  }
});

// DELETE /api/reviews/:id - admin: reject/delete review
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await rejectReview(req.params.id);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete review' });
  }
});

module.exports = router;
