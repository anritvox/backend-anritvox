// utils/mail.js
// Robust Mailjet mailer: SDK-first, HTTPS fallback.
// Usage: sendMail({ to, subject, html, text, from, attachments, cc, bcc })

const https = require("https");
const util = require("util");

// Environment keys (support several common names)
const MJ_PUBLIC =
  process.env.MAILJET_API_KEY ||
  process.env.MJ_APIKEY_PUBLIC ||
  process.env.MAILJET_PUBLIC;
const MJ_PRIVATE =
  process.env.MAILJET_API_SECRET ||
  process.env.MJ_APIKEY_PRIVATE ||
  process.env.MAILJET_PRIVATE;
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@yourdomain.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Anritvox";

if (!MJ_PUBLIC || !MJ_PRIVATE) {
  console.warn(
    "⚠️ MAILJET API keys not set (MAILJET_API_KEY / MAILJET_API_SECRET). Set them in env for sending email."
  );
}

/* ---------- Attempt to initialize SDK client (if available) ---------- */
let mailjetClient = null;
let sdkInitError = null;

try {
  const mj = require("node-mailjet");
  // Try several documented/observed initialization patterns
  try {
    if (typeof mj === "function") {
      // v6 factory style: mj({ apiKey, apiSecret }) -> client
      try {
        const client = mj({ apiKey: MJ_PUBLIC, apiSecret: MJ_PRIVATE });
        if (client && typeof client.post === "function") mailjetClient = client;
      } catch (e) {
        // try alternative factory shapes
      }
    }

    if (!mailjetClient && mj && typeof mj.apiConnect === "function") {
      try {
        mailjetClient = mj.apiConnect(MJ_PUBLIC, MJ_PRIVATE);
      } catch (e) {
        // continue
      }
    }

    if (!mailjetClient && mj && typeof mj.connect === "function") {
      try {
        mailjetClient = mj.connect(MJ_PUBLIC, MJ_PRIVATE);
      } catch (e) {
        // continue
      }
    }

    if (!mailjetClient && mj && typeof mj.post === "function") {
      // module exported an already-initialized client
      mailjetClient = mj;
    }

    if (!mailjetClient && mj && typeof mj.Client === "function") {
      try {
        mailjetClient = new mj.Client({
          apiKey: MJ_PUBLIC,
          apiSecret: MJ_PRIVATE,
        });
      } catch (e) {}
    }
  } catch (e) {
    sdkInitError = e;
  }
} catch (e) {
  // require failed (no SDK installed)
  sdkInitError = e;
}

if (mailjetClient && typeof mailjetClient.post === "function") {
  console.log("✅ Mailjet SDK initialized for sending emails.");
} else {
  console.warn(
    "⚠️ Mailjet SDK not usable; will fall back to direct HTTPS calls. SDK init error:",
    sdkInitError && sdkInitError.message ? sdkInitError.message : sdkInitError
  );
}

/* ---------- Helpers ---------- */

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

/* ---------- HTTPS (fallback) sender ---------- */

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
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch (e) {
          return reject(
            new Error(
              `Mailjet HTTP response parse error: ${e.message}. Raw: ${body}`
            )
          );
        }
        if (res.statusCode >= 200 && res.statusCode < 300)
          return resolve(parsed);
        // non-2xx
        const err = new Error(`Mailjet HTTP ${res.statusCode}`);
        err.body = parsed;
        return reject(err);
      });
    });

    req.on("error", (err) => reject(err));
    req.write(data);
    req.end();
  });
}

/* ---------- Main API: sendMail ---------- */

/**
 * sendMail(options)
 *  - to: string | array | { Email, Name }  (required)
 *  - cc, bcc: same as to
 *  - subject: string
 *  - html: string
 *  - text: string
 *  - from: string OR { Email, Name }  (optional)
 *  - attachments: [{ filename, content: Buffer|string (utf8 or base64), contentType }]
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

  const To = normalizeRecipient(to);
  const Cc = cc ? normalizeRecipient(cc) : undefined;
  const Bcc = bcc ? normalizeRecipient(bcc) : undefined;
  const Attachments = attachments
    ? normalizeAttachments(attachments)
    : undefined;

  const message = {
    From,
    To,
    Subject: subject || "(no subject)",
  };
  if (Cc && Cc.length) message.Cc = Cc;
  if (Bcc && Bcc.length) message.Bcc = Bcc;
  if (typeof text === "string") message.TextPart = text;
  if (typeof html === "string") message.HTMLPart = html;
  if (Attachments) message.Attachments = Attachments;

  const body = { Messages: [message] };

  // If SDK is available, use it.
  if (mailjetClient && typeof mailjetClient.post === "function") {
    try {
      const res = await mailjetClient
        .post("send", { version: "v3.1" })
        .request(body);
      return res.body;
    } catch (err) {
      // If SDK fails with auth/validation, include raw response when possible
      const meta = err?.response?.body || err?.message || err;
      console.error(
        "Mailjet SDK send error:",
        util.inspect(meta, { depth: 2 })
      );
      const errMsg =
        err?.response?.body?.Messages?.[0]?.Errors?.map(
          (e) => e.ErrorMessage
        ).join(", ") ||
        err?.message ||
        "Mailjet SDK error";
      const error = new Error(`Mailjet SDK failed: ${errMsg}`);
      error.meta = meta;
      throw error;
    }
  }

  // Otherwise use HTTPS fallback
  if (!MJ_PUBLIC || !MJ_PRIVATE) {
    throw new Error(
      "Mailjet credentials not available for HTTPS fallback (MJ_PUBLIC/MJ_PRIVATE missing)"
    );
  }

  try {
    const res = await httpSendMail(body);
    return res;
  } catch (err) {
    console.error(
      "Mailjet HTTP send error:",
      util.inspect(err.body || err, { depth: 3 })
    );
    const messageText =
      (err.body && (err.body.ErrorMessage || JSON.stringify(err.body))) ||
      err.message ||
      "Mailjet HTTP error";
    const e = new Error(`Mailjet HTTP send failed: ${messageText}`);
    e.meta = err.body || err;
    throw e;
  }
}

/* ---------- Optional helper: verifyTransport (lightweight health-check) ---------- */
async function verifyTransport() {
  // Try sending a dry-run check: Mailjet doesn't have a light ping endpoint for mail, so we do a single test
  if (!MJ_PUBLIC || !MJ_PRIVATE) {
    throw new Error("Mailjet API keys not set");
  }
  // Simple GET to /v3/REST/contactslist (requires auth) to verify keys — harmless read
  const auth = Buffer.from(`${MJ_PUBLIC}:${MJ_PRIVATE}`).toString("base64");
  const options = {
    hostname: "api.mailjet.com",
    path: "/v3/REST/RESTVersion", // this path likely doesn't exist; fallback to /v3/REST/contact
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
    },
  };

  // We'll call a known endpoint /v3/REST/contact (read-only) to check auth
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.mailjet.com",
      path: "/v3/REST/contact",
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    };
    const req = https.request(opts, (res) => {
      // 200 or 401 give us signal
      if (res.statusCode >= 200 && res.statusCode < 300)
        return resolve({ ok: true, statusCode: res.statusCode });
      let body = "";
      res.on("data", (c) => (body += c.toString()));
      res.on("end", () => {
        return resolve({ ok: false, statusCode: res.statusCode, body: body });
      });
    });
    req.on("error", (err) => reject(err));
    req.end();
  });
}

module.exports = { sendMail, verifyTransport };
