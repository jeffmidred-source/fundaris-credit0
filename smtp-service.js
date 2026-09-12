const nodemailer = require('nodemailer');

async function sendSmtpEmail({ host, port, secure, user, pass, from, to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined
  });

  return transporter.sendMail({
    from,
    to,
    subject,
    text
  });
}

module.exports = { sendSmtpEmail };

