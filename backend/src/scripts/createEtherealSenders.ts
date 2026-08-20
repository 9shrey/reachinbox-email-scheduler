import nodemailer from "nodemailer";
import { prisma } from "../db/prisma.js";

// Creates two fresh Ethereal (fake SMTP) test accounts and stores them as
// Sender rows, so the compose UI has >1 sender to pick from and the
// per-sender hourly rate limit is demonstrable. Run once: `pnpm seed:senders`.
async function main() {
  const specs = [
    { name: "ReachInbox Outreach", maxEmailsPerHour: 50 },
    { name: "ReachInbox Sales", maxEmailsPerHour: 20 },
  ];

  for (const spec of specs) {
    const account = await nodemailer.createTestAccount();
    const sender = await prisma.sender.create({
      data: {
        name: spec.name,
        fromEmail: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
        maxEmailsPerHour: spec.maxEmailsPerHour,
      },
    });
    console.log(`Created sender "${sender.name}" (${sender.id}) — ${account.user}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
