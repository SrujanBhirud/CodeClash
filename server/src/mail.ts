/** Sends the six-digit confirmation code. A failed send does not block signup. */
import nodemailer from 'nodemailer';

/** Thrown when SMTP_URL cannot be used. Port 25 is refused because cloud networks, including Oracle Cloud, block it. */
export class MailConfigError extends Error {}

export interface MailSettings {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  requireTLS: boolean;
}

/**
 * Mailpit is the inbox only when SMTP points at this machine.
 * A real relay returns null, so the page tells the person to check their own email.
 */
export function localInbox(smtp = process.env.SMTP_URL): string | null {
  if (!smtp) return null;
  try {
    const host = mailSettings(smtp).host;
    if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return 'http://127.0.0.1:8025';
  } catch {
    return null;
  }
  return null;
}

/** Turns SMTP_URL into transport settings. `smtps://` is port 465. Anything else on 587 uses STARTTLS. */
export function mailSettings(smtp: string): MailSettings {
  let url: URL;
  try {
    url = new URL(smtp);
  } catch {
    throw new MailConfigError('SMTP_URL is not a URL');
  }
  const secure = url.protocol === 'smtps:';
  const port = Number(url.port || (secure ? 465 : 587));
  if (!Number.isInteger(port) || port < 1) throw new MailConfigError('SMTP_URL has no port');
  if (port === 25) throw new MailConfigError('Port 25 is blocked from cloud VMs, including Oracle Cloud. Use port 587.');
  const user = decodeURIComponent(url.username);
  const pass = decodeURIComponent(url.password);
  return {
    host: url.hostname,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    requireTLS: !secure && port === 587,
  };
}

/**
 * Emails a 6-digit confirmation code.
 * Returns false when SMTP is unset or the send fails, so local development can still show the code.
 * The attempt gives up after 10 seconds instead of leaving the signup request hanging.
 */
export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const smtp = process.env.SMTP_URL;
  if (!smtp) return false;
  const from = process.env.MAIL_FROM || 'CodeClash <noreply@codeclash.local>';
  let settings: MailSettings;
  try {
    settings = mailSettings(smtp);
  } catch (error) {
    console.warn('verification email failed', error instanceof Error ? error.message : error);
    return false;
  }
  try {
    const transport = nodemailer.createTransport(settings);
    try {
      await transport.sendMail({
        from,
        to,
        subject: `${code} is your CodeClash confirmation code`,
        text: `Your confirmation code is ${code}.\n\nEnter it on the CodeClash sign-in page. It expires in 15 minutes.\n\nIf you did not create an account, ignore this email.\n`,
      });
    } finally {
      transport.close();
    }
    return true;
  } catch (error) {
    console.warn(`verification email failed via ${settings.host}:${settings.port}`, error instanceof Error ? error.message : error);
    return false;
  }
}
