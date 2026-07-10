import "server-only";
import { createTransport, type Transporter } from "nodemailer";

export function createSmtpTransport(): Transporter {
  return createTransport({
    host: process.env.EMAIL_SERVER_HOST,
    port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
    secure: Number(process.env.EMAIL_SERVER_PORT ?? 465) === 465,
    auth: {
      user: process.env.EMAIL_SERVER_USER,
      pass: process.env.EMAIL_SERVER_PASSWORD,
    },
  });
}
