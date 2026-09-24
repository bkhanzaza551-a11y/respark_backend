import nodemailer from "nodemailer";

let transporter;

const CONNECTION_TIMEOUT_MS = Number(process.env.SMTP_TIMEOUT_MS || 5000);
const SEND_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;

const smtpConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);

const createTransporter = () => {
  if (smtpConfigured()) {
    const isGmail = (process.env.SMTP_HOST || "").toLowerCase().includes("gmail") || 
                    (process.env.SMTP_SERVICE || "").toLowerCase() === "gmail";

    if (isGmail) {
      return nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: CONNECTION_TIMEOUT_MS,
        socketTimeout: SEND_TIMEOUT_MS,
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS || ""
            }
          : undefined,
        tls: { rejectUnauthorized: false }
      });
    }

    const port = Number(process.env.SMTP_PORT);
    const secure = port === 465 || String(process.env.SMTP_SECURE || "false") === "true";

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || ""
          }
        : undefined,
      tls: { rejectUnauthorized: false }
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true
  });
};

export const getMailer = () => {
  if (!transporter) transporter = createTransporter();
  return transporter;
};

export const mailerMode = () => (smtpConfigured() ? "smtp" : "json");
export const mailerStatus = () => ({
  mode: zeptoConfigured() ? "zeptomail" : mailerMode(),
  zeptoConfigured: zeptoConfigured(),
  smtpConfigured: smtpConfigured(),
  host: process.env.SMTP_HOST || null,
  port: process.env.SMTP_PORT || null,
  from: parseFrom().address,
  user: process.env.SMTP_USER || null,
  timeout: CONNECTION_TIMEOUT_MS
});

const stripHtml = (html) => {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ZeptoMail HTTP transport (Railway blocks outbound SMTP) ────────────────
const ZEPTO_URL = "https://api.zeptomail.in/v1.1/email";
const zeptoConfigured = () => Boolean(process.env.ZEPTOMAIL_API_KEY);

const parseFrom = () => {
  const raw = process.env.SMTP_FROM || process.env.MAIL_FROM || "Salon Nest <noreply@salonnest.in>";
  const match = String(raw).match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (match) return { address: match[2].trim(), name: (match[1] || "Salon Nest").trim() };
  if (raw.includes("@")) return { address: raw.trim(), name: "Salon Nest" };
  return { address: "noreply@salonnest.in", name: raw.trim() || "Salon Nest" };
};

const splitRecipients = (value) =>
  (Array.isArray(value) ? value : String(value || "").split(","))
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);

const sendViaZeptoMail = async (options) => {
  const from = parseFrom();
  const toList = splitRecipients(options.to);
  if (!toList.length) throw new Error("No recipient address");

  const payload = {
    from: { address: from.address, name: from.name },
    to: toList.map((address) => ({ email_address: { address, name: "" } })),
    subject: options.subject || "(no subject)"
  };
  if (options.html) payload.htmlbody = options.html;
  payload.textbody = options.text || stripHtml(options.html || "");
  if (options.cc) payload.cc = splitRecipients(options.cc).map((address) => ({ email_address: { address, name: "" } }));
  if (options.bcc) payload.bcc = splitRecipients(options.bcc).map((address) => ({ email_address: { address, name: "" } }));
  if (options.replyTo) payload.reply_to = [{ address: options.replyTo, name: "" }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ZEPTO_URL, {
      method: "POST",
      headers: {
        Authorization: `Zoho-enczapikey ${process.env.ZEPTOMAIL_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`ZeptoMail ${response.status}: ${text.slice(0, 300)}`);
    }
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    return { messageId: parsed.message_id || parsed.request_id || null, mode: "zeptomail", preview: null };
  } finally {
    clearTimeout(timer);
  }
};


const pendingEmails = [];

export const getPendingEmails = () => pendingEmails;

export const retryPendingEmails = async () => {
  if (pendingEmails.length === 0) return;
  const batch = [...pendingEmails];
  pendingEmails.length = 0;
  let sent = 0;
  for (const job of batch) {
    try {
      await sendMail(job);
      sent++;
    } catch {
      pendingEmails.push(job);
    }
  }
  console.log(`[mailer] Retry batch: ${sent}/${batch.length} sent, ${pendingEmails.length} still pending`);
};

export const sendMail = async (options) => {
  const hasTransport = zeptoConfigured() || smtpConfigured();
  if (!hasTransport) {
    console.log(`[mailer] No transport configured, email logged for ${options.to}: ${options.subject || "(no subject)"}`);
    return { mode: "json", messageId: null, preview: "No mail transport configured" };
  }

  const useZepto = zeptoConfigured();
  if (useZepto) options = { ...options, text: options.text || stripHtml(options.html || "") };

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (useZepto) {
        const result = await sendViaZeptoMail(options);
        if (attempt > 0) console.log(`[mailer] Email sent on attempt ${attempt + 1} to ${options.to}`);
        return { mode: result.mode, messageId: result.messageId, preview: null };
      }

      const mail = await getMailer().sendMail({
        from: process.env.SMTP_FROM || '"SalonNest" <govardhan@salonnest.in>',
        ...options,
        text: options.text || stripHtml(options.html || ""),
        attachments: options.attachments || []
      });

      if (attempt > 0) console.log(`[mailer] Email sent on attempt ${attempt + 1} to ${options.to}`);
      return {
        mode: mailerMode(),
        messageId: mail.messageId || null,
        preview: typeof mail.message === "string" ? mail.message : null
      };
    } catch (err) {
      lastError = err;
      console.error(`[mailer] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for ${options.to}: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        transporter = null;
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  console.error(`[mailer] All ${MAX_RETRIES + 1} attempts failed for ${options.to}. Queuing for retry.`);
  pendingEmails.push({ ...options, _queuedAt: Date.now() });
  return { mode: useZepto ? "zeptomail" : mailerMode(), messageId: null, queued: true };
};
