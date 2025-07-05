const express = require("express");
const router = express.Router();
const { upload, presign } = require("../config/s3Upload");

const {
  getAllProducts,
  getProductById,
  createProduct,
  addProductImage,
  addSerialNumber,
  updateProduct,
  deleteProduct,
} = require("../models/productModel");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/products
// Respond with product list, images converted to presigned URLs
router.get("/", async (req, res) => {
  // console.log("▶️ HIT GET /api/products");
  try {
    const products = await getAllProducts();

    for (const p of products) {
      console.log(`Raw DB values for product ${p.id}:`, p.images);
      // 1) Normalize to object keys
      const keys = p.images.map((img) => {
        if (img.startsWith("http")) {
          // existing full-URL entry → extract pathname
          const url = new URL(img);
          return url.pathname.slice(1); // removes leading '/'
        }
        return img; // already a key
      });

      // 2) Generate signed URLs
      p.images = await Promise.all(keys.map((key) => presign(key)));
    }

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  // console.log(`▶️ HIT GET /api/products/${req.params.id}`);
  try {
    const product = await getProductById(req.params.id);
    if (!product) return res.status(404).json({ message: "Not found" });

    console.log("Raw DB values for single product:", product.images);
    const keys = product.images.map((img) => {
      if (img.startsWith("http")) {
        const url = new URL(img);
        return url.pathname.slice(1);
      }
      return img;
    });
    product.images = await Promise.all(keys.map((key) => presign(key)));

    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST /api/products
// multipart/form-data with images[], serials JSON
router.post(
  "/",
  authMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        quantity,
        category_id,
        subcategory_id,
      } = req.body;

      // Parse serials array
      let serials = [];
      try {
        serials = JSON.parse(req.body.serials || "[]");
      } catch {
        return res.status(400).json({ message: "Invalid serials format" });
      }

      // 1) Create product record
      const productId = await createProduct({
        name,
        description,
        price,
        quantity,
        category_id,
        subcategory_id,
      });

      // 2) Store image keys
      for (const file of req.files) {
        await addProductImage(productId, file.key);
      }

      // 3) Store serial numbers
      for (let s of serials) {
        s = s.trim().toUpperCase();
        if (!/^[A-Z0-9]+$/.test(s)) {
          return res.status(400).json({ message: `Invalid serial: ${s}` });
        }
        await addSerialNumber(productId, s);
      }

      res.status(201).json({ id: productId });
    } catch (err) {
      console.error("Error creating product:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// PUT /api/products/:id
// Update fields, add new images/serials
router.put(
  "/:id",
  authMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const {
        name,
        description,
        price,
        quantity,
        category_id,
        subcategory_id,
      } = req.body;
      const productId = req.params.id;

      // 1) Update core fields
      await updateProduct(productId, {
        name,
        description,
        price,
        quantity,
        category_id,
        subcategory_id,
      });

      // 2) Save any new images
      for (const file of req.files) {
        await addProductImage(productId, file.key);
      }

      // 3) Parse and add new serials if provided
      if (req.body.serials) {
        let serials = [];
        try {
          serials = JSON.parse(req.body.serials);
        } catch {
          return res.status(400).json({ message: "Invalid serials format" });
        }
        for (let s of serials) {
          s = s.trim().toUpperCase();
          if (!/^[A-Z0-9]+$/.test(s)) {
            return res.status(400).json({ message: `Invalid serial: ${s}` });
          }
          await addSerialNumber(productId, s);
        }
      }

      res.json({ id: productId });
    } catch (err) {
      console.error("Error updating product:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// DELETE /api/products/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
