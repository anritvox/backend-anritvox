// utils/mail.js
// Robust Mailjet mailer: SDK-first, HTTPS fallback with Order Status Templates.
// Usage: sendMail({ to, subject, html, text }) or sendOrderStatusEmail(...)

const https = require("https");
const util = require("util");

// Environment keys
const MJ_PUBLIC =
  process.env.MAILJET_API_KEY ||
  process.env.MJ_APIKEY_PUBLIC ||
  process.env.MAILJET_PUBLIC;
const MJ_PRIVATE =
  process.env.MAILJET_API_SECRET ||
  process.env.MJ_APIKEY_PRIVATE ||
  process.env.MAILJET_PRIVATE;
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@yourdomain.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "ANRITVOX Logistics";

if (!MJ_PUBLIC || !MJ_PRIVATE) {
  console.warn(
    "⚠️ MAILJET API keys not set. Email functionality will be disabled or fail."
  );
}

/* ---------- Mailjet SDK Initialization ---------- */
let mailjetClient = null;
try {
  const mj = require("node-mailjet");
  if (typeof mj === "function") {
    mailjetClient = mj({ apiKey: MJ_PUBLIC, apiSecret: MJ_PRIVATE });
  } else if (mj && typeof mj.apiConnect === "function") {
    mailjetClient = mj.apiConnect(MJ_PUBLIC, MJ_PRIVATE);
  } else if (mj && typeof mj.connect === "function") {
    mailjetClient = mj.connect(MJ_PUBLIC, MJ_PRIVATE);
  }
} catch (e) {
  console.warn("⚠️ Mailjet SDK not found; falling back to direct HTTPS calls.");
}

/* ---------- Internal Helpers ---------- */

function normalizeRecipient(recipient) {
  if (!recipient) return [];
  if (Array.isArray(recipient)) return recipient.map(normalizeRecipient).flat();
  if (typeof recipient === "string") {
    const m = recipient.match(/^(.*)<(.+@.+)>$/);
    if (m) return [{ Email: m[2].trim(), Name: m[1].trim() }];
    return [{ Email: recipient.trim() }];
  }
  if (recipient && recipient.Email) return [recipient];
  return [];
}

function normalizeAttachments(attachments) {
  if (!attachments) return undefined;
  return attachments.map((a) => {
    let base64;
    if (Buffer.isBuffer(a.content)) base64 = a.content.toString("base64");
    else if (typeof a.content === "string") {
      const cleaned = a.content.replace(/\s/g, "");
      const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(cleaned);
      base64 = looksBase64
        ? cleaned
        : Buffer.from(a.content, "utf8").toString("base64");
    } else {
      throw new Error("Attachment content must be Buffer or string");
    }
    return {
      ContentType: a.contentType || a.type || "application/octet-stream",
      Filename: a.filename,
      Base64Content: base64,
    };
  });
}

function httpSendMail(payload) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString("base64");
    const data = JSON.stringify(payload);
    const options = {
      hostname: "api.mailjet.com",
      path: "/v3.1/send",
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk.toString()));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(`Mailjet HTTP ${res.statusCode}: ${body}`));
        } catch (e) {
          reject(new Error(`Response parse error. Raw: ${body}`));
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.write(data);
    req.end();
  });
}

/* ---------- Primary Exported Functions ---------- */

/**
 * sendMail(options)
 * Core engine for sending emails via Mailjet.
 */
async function sendMail({
  to,
  cc,
  bcc,
  subject,
  html,
  text,
  from,
  attachments,
}) {
  if (!to) throw new Error("sendMail: 'to' is required");

  const From = (() => {
    if (!from) return { Email: EMAIL_FROM, Name: EMAIL_FROM_NAME };
    if (typeof from === "string") {
      const m = from.match(/^(.*)<(.+@.+)>$/);
      if (m) return { Email: m[2].trim(), Name: m[1].trim() };
      return { Email: from };
    }
    return { Email: from.Email, Name: from.Name || EMAIL_FROM_NAME };
  })();

  const message = {
    From,
    To: normalizeRecipient(to),
    Subject: subject || "(no subject)",
    Cc: cc ? normalizeRecipient(cc) : undefined,
    Bcc: bcc ? normalizeRecipient(bcc) : undefined,
    TextPart: text,
    HTMLPart: html,
    Attachments: attachments ? normalizeAttachments(attachments) : undefined,
  };

  const body = { Messages: [message] };

  if (mailjetClient && typeof mailjetClient.post === "function") {
    try {
      const res = await mailjetClient.post("send", { version: "v3.1" }).request(body);
      return res.body;
    } catch (err) {
      console.error("Mailjet SDK Error:", util.inspect(err.response?.body || err.message, { depth: 2 }));
      throw err;
    }
  }

  return httpSendMail(body);
}

/**
 * sendOrderStatusEmail(email, name, orderId, status, tracking, courier)
 * Specialized function for professionally formatted order updates.
 */
const sendOrderStatusEmail = async (email, name, orderId, status, tracking = null, courier = null) => {
  let statusMessage = "";
  let color = "#3b82f6"; 
  let trackingBlock = "";

  switch (status.toLowerCase()) {
    case "processing":
      statusMessage = "Your order is now being processed and packed.";
      color = "#f59e0b"; 
      break;
    case "shipped":
      statusMessage = "Great news! Your order has been shipped.";
      color = "#8b5cf6"; 
      if (tracking && courier) {
        trackingBlock = `
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #4b5563; text-transform: uppercase; font-weight: bold;">Tracking Information</p>
            <p style="margin: 5px 0 0 0; font-size: 18px; color: #111827; font-weight: 900; letter-spacing: 1px;">${tracking}</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #6b7280;">Courier: ${courier}</p>
          </div>
        `;
      }
      break;
    case "delivered":
      statusMessage = "Your order has been delivered successfully. Enjoy your product!";
      color = "#10b981"; 
      break;
    case "cancelled":
      statusMessage = "Your order has been cancelled.";
      color = "#ef4444"; 
      break;
    default:
      statusMessage = `Your order status has been updated to: ${status}`;
  }

  const htmlTemplate = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
      <div style="background-color: #050505; padding: 30px; text-align: center; border-bottom: 4px solid ${color};">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 2px;">ANRITVOX</h1>
      </div>
      <div style="padding: 40px 30px; background-color: #ffffff;">
        <h2 style="color: #111827; margin-top: 0;">Hello ${name},</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${statusMessage}
        </p>
        <div style="margin-top: 25px; border-left: 4px solid ${color}; padding-left: 15px;">
          <p style="margin: 0; font-size: 14px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Order Reference</p>
          <p style="margin: 5px 0 0 0; font-size: 18px; color: #111827; font-weight: bold;">#${orderId}</p>
        </div>
        ${trackingBlock}
        <p style="color: #6b7280; font-size: 14px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          If you have any questions about your shipment, please reply to this email or contact our support team.
        </p>
      </div>
    </div>
  `;

  return sendMail({
    to: email,
    subject: `Order Update: #${orderId} - ${status.toUpperCase()}`,
    html: htmlTemplate
  });
};

/**
 * verifyTransport()
 * Verifies Mailjet credentials by making a lightweight API call.
 */
async function verifyTransport() {
  if (!MJ_PUBLIC || !MJ_PRIVATE) throw new Error("Mailjet API keys not set");
  const auth = Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString("base64");
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.mailjet.com",
      path: "/v3/REST/contact",
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
      else resolve({ ok: false, statusCode: res.statusCode });
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

module.exports = { sendMail, sendOrderStatusEmail, verifyTransport };
