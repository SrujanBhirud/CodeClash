import nodemailer from 'nodemailer';

/** Emails the confirmation token. Returns false when SMTP is unset or the send fails, so the caller can still show the token on screen. */
export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const smtp = process.env.SMTP_URL;
  if (!smtp) return false;
  const from = process.env.MAIL_FROM || 'CodeClash <noreply@codeclash.local>';
  try {
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({
      from,
      to,
      subject: 'Confirm your CodeClash account',
      text: `Your confirmation token is ${token}.\n\nEnter it on the CodeClash sign-in page. It expires in 24 hours.\n\nIf you did not create an account, ignore this email.\n`,
    });
    return true;
  } catch (error) {
    console.warn('verification email failed', error);
    return false;
  }
}
