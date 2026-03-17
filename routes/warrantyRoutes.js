const express = require("express");
const router = express.Router();
const {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateRegistrationStatus,
  deleteRegistration,
} = require("../models/warrantyModel");
const { authenticateAdmin } = require("../middleware/authMiddleware");

// GET /api/warranty/validate/:serial (Used for instant scan/check)
router.get("/validate/:serial", async (req, res) => {
  try {
    const info = await validateSerial(req.params.serial);
    res.json(info);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
});

// POST /api/warranty/register
router.post("/register", async (req, res) => {
  try {
    // Matching exact variables sent from EWarranty.jsx
    const { serialNumber, productId, customerName, email, phone, purchaseDate, invoiceNumber } = req.body;
    
    if (!serialNumber || !productId || !customerName || !email || !phone) {
      return res.status(400).json({ message: "All mandatory fields are required." });
    }

    const result = await registerWarranty({
      serialNumber,
      productId,
      customerName,
      email,
      phone,
      purchaseDate,
      invoiceNumber
    });

    res.status(201).json({ message: "Warranty successfully activated", ...result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
});

// Admin: list all registrations
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: accept/reject
router.put("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await updateRegistrationStatus(req.params.id, status);
    res.json({ message: "Status Updated", ...updated });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  }
});

// Admin: delete registration
router.delete("/admin/:id", authenticateAdmin, async (req, res) => {
  try {
    await deleteRegistration(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
