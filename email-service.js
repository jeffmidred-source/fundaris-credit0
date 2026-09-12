const nodemailer = require('nodemailer');

async function sendNotificationEmail({ to, subject, message }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@fundariscredit.com';
  const targetEmail = to || process.env.SMTP_TO || process.env.ADMIN_EMAIL || 'fundariscredit0@gmail.com';

  if (!host || !user || !pass) {
    console.log(`[EMAIL QUEUED] To: ${targetEmail} | Subject: ${subject}`);
    console.log(message);
    return {
      success: true,
      queued: true,
      to: targetEmail,
      subject,
      message,
      note: 'SMTP is not configured yet. Notification was queued in console mode.'
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  try {
    const info = await transporter.sendMail({
      from,
      to: targetEmail,
      subject,
      text: message
    });

    return {
      success: true,
      queued: false,
      to: targetEmail,
      subject,
      messageId: info.messageId,
      note: 'SMTP email sent successfully.'
    };
  } catch (error) {
    console.error('SMTP email delivery failed:', error);
    return {
      success: false,
      queued: false,
      to: targetEmail,
      subject,
      error: error.message
    };
  }
}

module.exports = { sendNotificationEmail };

