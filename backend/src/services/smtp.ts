import nodemailer, { type Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";

// One nodemailer transporter per sender, cached by senderId — avoids
// reconnecting to Ethereal's SMTP for every single send.
const transporterCache = new Map<string, Transporter>();

function transporterFor(sender: Sender): Transporter {
  const cached = transporterCache.get(sender.id);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: false, // Ethereal uses STARTTLS on 587, not implicit TLS
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
  });

  transporterCache.set(sender.id, transporter);
  return transporter;
}

export async function sendViaSender(
  sender: Sender,
  opts: { to: string; subject: string; html: string }
) {
  const transporter = transporterFor(sender);
  const info = await transporter.sendMail({
    from: `"${sender.name}" <${sender.fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  // Ethereal-specific: a URL where the "sent" email can be viewed in a browser.
  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
  return { messageId: info.messageId, previewUrl };
}
