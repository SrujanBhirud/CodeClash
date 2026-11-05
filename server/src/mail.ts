import nodemailer from 'nodemailer';

/** Emails a 6-digit confirmation code. Returns false when SMTP is unset or the send fails, so the caller can still show the code on screen. */
export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  const smtp = process.env.SMTP_URL;
  if (!smtp) return false;
  const from = process.env.MAIL_FROM || 'CodeClash <noreply@codeclash.local>';
  try {
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({
      from,
      to,
      subject: `${code} is your CodeClash confirmation code`,
      text: `Your confirmation code is ${code}.\n\nEnter it on the CodeClash sign-in page. It expires in 15 minutes.\n\nIf you did not create an account, ignore this email.\n`,
    });
    return true;
  } catch (error) {
    console.warn('verification email failed', error);
    return false;
  }
}
