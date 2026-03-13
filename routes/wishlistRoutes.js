// backend/routes/wishlistRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateUser } = require('./userRoutes');
const { addToWishlist, removeFromWishlist, getWishlistByUser, isInWishlist } = require('../models/wishlistModel');

// GET /api/wishlist - get user wishlist
router.get('/', authenticateUser, async (req, res) => {
  try {
    const items = await getWishlistByUser(req.user.id);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get wishlist' });
  }
});

// POST /api/wishlist/:productId - add to wishlist
router.post('/:productId', authenticateUser, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    await addToWishlist(req.user.id, productId);
    res.json({ message: 'Added to wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to add to wishlist' });
  }
});

// DELETE /api/wishlist/:productId - remove from wishlist
router.delete('/:productId', authenticateUser, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    await removeFromWishlist(req.user.id, productId);
    res.json({ message: 'Removed from wishlist' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to remove from wishlist' });
  }
});

// GET /api/wishlist/check/:productId - check if in wishlist
router.get('/check/:productId', authenticateUser, async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const inWishlist = await isInWishlist(req.user.id, productId);
    res.json({ inWishlist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to check wishlist' });
  }
});

module.exports = router;
