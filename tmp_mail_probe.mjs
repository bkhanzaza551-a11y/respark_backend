import "dotenv/config";
const m = await import("./src/lib/mailer.js");
console.log("mailerStatus:", JSON.stringify(m.mailerStatus()));

process.env.ZEPTOMAIL_API_KEY = "test-key-123";
// re-import won't re-evaluate; instead probe via sendMail with unreachable key to confirm zepto branch is chosen
const res = await m.sendMail({
  to: "nobody@example.invalid",
  subject: "probe",
  text: "probe body"
});
console.log("sendMail result:", JSON.stringify(res));
process.exit(0);
