const express = require("express");
const router = express.Router();
const { upload, presign } = require("../config/s3Upload");
const pool = require("../config/db");
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

// Helper: convert stored keys or URLs into pre-signed URLs
const convertImagesToSignedUrls = async (images) => {
  const keys = images.map((img) => {
    if (img.startsWith("http")) {
      const url = new URL(img);
      return url.pathname.slice(1);
    }
    return img;
  });
  return Promise.all(keys.map((key) => presign(key)));
};

// GET /api/products
router.get("/", async (req, res) => {
  try {
    const products = await getAllProducts();
    for (const p of products) {
      p.images = await convertImagesToSignedUrls(p.images);
    }
    return res.json(products);
  } catch (err) {
    console.error("Error fetching products:", err);
    return res
      .status(500)
      .json({ error: "Unable to load products. Please try again later." });
  }
});

// GET /api/products/:id
router.get("/:id", async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }
    product.images = await convertImagesToSignedUrls(product.images);
    return res.json(product);
  } catch (err) {
    console.error("Error fetching product:", err);
    return res
      .status(500)
      .json({ error: "Unable to load product. Please try again later." });
  }
});

// POST /api/products
router.post(
  "/",
  authMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    let productId;
    try {
      // Parse serials
      let serials = [];
      try {
        serials = JSON.parse(req.body.serials || "[]");
      } catch {
        return res.status(400).json({ error: "Invalid serials format." });
      }

      // Clean & validate
      const cleaned = serials.map((s) => s.trim().toUpperCase());
      const invalid = cleaned.filter((s) => !/^[A-Z0-9]+$/.test(s));
      const dupes = cleaned.filter((s, i) => cleaned.indexOf(s) !== i);
      if (invalid.length) {
        return res.status(400).json({
          error: `Invalid serial(s): ${[...new Set(invalid)].join(", ")}.`,
        });
      }
      if (dupes.length) {
        return res.status(400).json({
          error: `Duplicate serial(s) in upload: ${[...new Set(dupes)].join(
            ", "
          )}.`,
        });
      }

      // Determine quantity
      const quantityToStore =
        cleaned.length > 0 ? cleaned.length : Number(req.body.quantity) || 0;

      // Create product record
      const { name, description, price, category_id, subcategory_id } =
        req.body;
      productId = await createProduct({
        name,
        description,
        price,
        quantity: quantityToStore,
        category_id,
        subcategory_id: subcategory_id || null,
      });

      // Add images
      for (const file of req.files) {
        await addProductImage(productId, file.key);
      }

      // Add serial numbers
      for (const s of cleaned) {
        try {
          await addSerialNumber(productId, s);
        } catch (serialErr) {
          if (serialErr.status === 409 && serialErr.duplicateSerial) {
            // Rollback created product on error
            if (productId) {
              try {
                await deleteProduct(productId);
              } catch (cleanupErr) {
                console.error("Cleanup failed:", cleanupErr);
              }
            }
            return res.status(409).json({
              error: `Duplicate serial number detected: ${serialErr.duplicateSerial}`,
              duplicateSerial: serialErr.duplicateSerial,
            });
          }
          throw serialErr;
        }
      }

      return res.status(201).json({ id: productId });
    } catch (err) {
      console.error("Error creating product:", err);
      // Rollback created product on error
      if (productId) {
        try {
          await deleteProduct(productId);
        } catch (cleanupErr) {
          console.error("Cleanup failed:", cleanupErr);
        }
      }
      // Handle duplicate entry
      if (err.code === "ER_DUP_ENTRY") {
        const match = err.sqlMessage.match(/Duplicate entry '(.+?)'/);
        const dupSerial = match ? match[1] : null;
        return res.status(400).json({
          error: dupSerial
            ? `Serial number '${dupSerial}' already exists. Please use a unique serial.`
            : "Duplicate serial number error.",
        });
      }
      return res
        .status(500)
        .json({ error: "Unable to create product. Please try again." });
    }
  }
);

// PUT /api/products/:id
router.put(
  "/:id",
  authMiddleware,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const productId = req.params.id;

      // Parse & validate serials
      let serials = [];
      if (req.body.serials) {
        try {
          serials = JSON.parse(req.body.serials);
        } catch {
          return res.status(400).json({ error: "Invalid serials format." });
        }
        const cleaned = serials.map((s) => s.trim().toUpperCase());
        const invalid = cleaned.filter((s) => !/^[A-Z0-9]+$/.test(s));
        const dupes = cleaned.filter((s, i) => cleaned.indexOf(s) !== i);
        if (invalid.length) {
          return res.status(400).json({
            error: `Invalid serial(s): ${[...new Set(invalid)].join(", ")}.`,
          });
        }
        if (dupes.length) {
          return res.status(400).json({
            error: `Duplicate serial(s): ${[...new Set(dupes)].join(", ")}.`,
          });
        }
        req.body.quantity = cleaned.length;
        req.body.serials = cleaned;
      }

      // Update core product
      const {
        name,
        description,
        price,
        quantity,
        category_id,
        subcategory_id,
      } = req.body;
      await updateProduct(productId, {
        name,
        description,
        price,
        quantity: Number(quantity) || 0,
        category_id,
        subcategory_id: subcategory_id || null,
        serials: req.body.serials,
      });

      // Add new images
      for (const file of req.files) {
        await addProductImage(productId, file.key);
      }

      return res.json({ id: productId });
    } catch (err) {
      console.error("Error updating product:", err);
      if (err.code === "ER_DUP_ENTRY") {
        const match = err.sqlMessage.match(/Duplicate entry '(.+?)'/);
        const dupSerial = match ? match[1] : null;
        return res.status(400).json({
          error: dupSerial
            ? `Serial number '${dupSerial}' already exists. Please choose a unique serial.`
            : "Duplicate serial number error.",
        });
      }
      return res
        .status(500)
        .json({ error: "Unable to update product. Please try again." });
    }
  }
);

// DELETE /api/products/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    return res.status(204).end();
  } catch (err) {
    console.error("Error deleting product:", err);
    return res
      .status(500)
      .json({ error: "Unable to delete product. Please try again." });
  }
});

module.exports = router;
