import nodemailer from "nodemailer";
import { config, isMailConfigured } from "./config";

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (!isMailConfigured()) {
    throw new Error("Mail is not configured (set SMTP_HOST and MAIL_FROM)");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined
    });
  }
  return transporter;
}

export async function sendTransactionalMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const t = getTransport();
  await t.sendMail({
    from: config.mailFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  });
}
