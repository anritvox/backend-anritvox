const express = require("express");
const router = express.Router();
const {
  validateSerial,
  registerWarranty,
  getAllRegistrations,
  updateRegistrationStatus,
  deleteRegistration,
} = require("../models/warrantyModel");
const authMiddleware = require("../middleware/authMiddleware");
const { sendMail } = require("../utils/mail");
const pool = require("../config/db");

// Helper to format date‐time
function formatDateTime(date = new Date()) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// GET /api/warranty/validate/:serial
router.get("/validate/:serial", async (req, res) => {
  try {
    const info = await validateSerial(req.params.serial);
    res.json({
      product_id: info.product_id,
      product_name: info.product_name,
      category_id: info.category_id,
      category_name: info.category_name,
    });
  } catch (err) {
    console.error("Warranty validation error:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// POST /api/warranty/register
router.post("/register", async (req, res) => {
  try {
    const { serial, product_id, user_name, user_email, user_phone } = req.body;
    if (!serial || !product_id || !user_name || !user_email || !user_phone) {
      return res.status(400).json({
        message:
          "serial, product_id, user_name, user_email, and user_phone are required",
      });
    }

    // 1) Validate serial to fetch product info
    const info = await validateSerial(serial);

    // 2) Perform registration
    const result = await registerWarranty({
      serial,
      product_id,
      user_name,
      user_email,
      user_phone,
    });

    // 3) Send confirmation email to customer
    const regTime = formatDateTime();
    await sendMail({
      to: user_email,
      subject: "Anritvox Warranty Registration Confirmation",
      html: `
        <div style="font-family:Arial,sans-serif; color:#333;">
          <h2 style="color:#2E86C1;">Warranty Registration Received</h2>
          <p>Dear <strong>${user_name}</strong>,</p>
          <p>Thank you for registering your warranty with <strong>Anritvox</strong>.</p>
          <table style="border-collapse:collapse; width:100%; margin:10px 0;">
            <tr>
              <td style="padding:6px; border:1px solid #ccc;"><strong>Product</strong></td>
              <td style="padding:6px; border:1px solid #ccc;">${
                info.product_name
              }</td>
            </tr>
            <tr>
              <td style="padding:6px; border:1px solid #ccc;"><strong>Serial No.</strong></td>
              <td style="padding:6px; border:1px solid #ccc;">${serial.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding:6px; border:1px solid #ccc;"><strong>Registered On</strong></td>
              <td style="padding:6px; border:1px solid #ccc;">${regTime}</td>
            </tr>
          </table>
          <p>We will review your request and notify you once it has been processed.</p>
          <p>
            <span style="font-size:0.9em; color:#555;">
              Note: By registering, you agree to our <a href="#" style="color:#2E86C1;">Terms & Conditions</a>.
            </span>
          </p>
          <p style="margin-top:20px;">
            For any questions, contact us at <a href="tel:+919654131435" style="color:#2E86C1;">+91 96541 31435</a>.
          </p>
          <p>Regards,<br/><strong>Anritvox Support Team</strong></p>
        </div>
      `,
    });

    // 4) Respond to client
    res.status(201).json({ message: "Warranty registered", ...result });
  } catch (err) {
    console.error("Warranty registration error:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// Admin: list all registrations
router.get("/admin", authMiddleware, async (req, res) => {
  try {
    const list = await getAllRegistrations();
    res.json(list);
  } catch (err) {
    console.error("Error listing registrations:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: accept/reject
router.put("/admin/:id", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted' or 'rejected'
    const updated = await updateRegistrationStatus(req.params.id, status);

    // Fetch registration details to notify the user
    const [[reg]] = await pool.query(
      `SELECT
         wr.user_name,
         wr.user_email,
         sn.serial,
         p.name AS product_name
       FROM warranty_registrations wr
       JOIN serial_numbers sn ON wr.serial_number_id = sn.id
       JOIN products p ON wr.product_id = p.id
       WHERE wr.id = ?`,
      [req.params.id]
    );

    // Timestamp
    const actionTime = formatDateTime();

    // Prepare email
    const subject =
      status === "accepted"
        ? "Your Anritvox Warranty is Now Active"
        : "Anritvox Warranty Request Update";
    const html = `
      <div style="font-family:Arial,sans-serif; color:#333;">
        <h2 style="color:#2E86C1;">Warranty ${
          status === "accepted" ? "Activated" : "Update"
        }</h2>
        <p>Dear <strong>${reg.user_name}</strong>,</p>
        <p>Your warranty request for <strong>${
          reg.product_name
        }</strong> (Serial: <code>${
      reg.serial
    }</code>) has been <strong style="color:${
      status === "accepted" ? "#28A745" : "#C0392B"
    };">${status.toUpperCase()}</strong> on <strong>${actionTime}</strong>.</p>
        ${
          status === "accepted"
            ? `<p>Thank you for choosing Anritvox. Your warranty is now active.</p>
               <p>Please <strong>keep this email</strong> for your records and follow our <a href="#" style="color:#2E86C1;">Warranty Guidelines</a>.</p>`
            : `<p>We’re sorry, but your warranty request cannot be honored at this time.</p>
               <p>If you have any questions, please refer to our <a href="#" style="color:#2E86C1;">Terms & Conditions</a> or contact us.</p>`
        }
        <p style="font-size:0.9em; color:#555; margin-top:10px;">
          Note: All warranty decisions are subject to company <a href="#" style="color:#2E86C1;">T&amp;C</a>. 
          For assistance, call <a href="tel:+919654131435" style="color:#2E86C1;">+91 96541 31435</a>.
        </p>
        <p style="margin-top:20px;">Regards,<br/><strong>Anritvox Support Team</strong></p>
      </div>
    `;

    // Send status update email
    await sendMail({ to: reg.user_email, subject, html });

    // Respond to admin
    res.json({ message: "Updated", ...updated });
  } catch (err) {
    console.error("Error updating status:", err);
    res
      .status(err.status || 500)
      .json({ message: err.message || "Server error" });
  }
});

// Admin: delete registration
router.delete("/admin/:id", authMiddleware, async (req, res) => {
  try {
    await deleteRegistration(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting registration:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
