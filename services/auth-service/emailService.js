// services/auth-service/emailService.js
const nodemailer = require('nodemailer');
const logger = require('./logger');
const config = require('./config'); // Import config

// Configure the email transport using config object
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.auth.user,
    pass: config.email.auth.pass,
  },
  tls: {
    rejectUnauthorized: config.email.tlsRejectUnauthorized,
  }
});

/**
 * Sends a password reset email.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} resetToken - The password reset token (unhashed).
 * @param {string} frontendUrl - The base URL of the frontend application.
 */
async function sendPasswordResetEmail(toEmail, resetToken, frontendUrl) {
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`; // Example link structure

  const mailOptions = {
    from: `"LearnBridge Support" <${config.email.from}>`, // Sender address from config
    to: toEmail, // List of receivers
    subject: 'Password Reset Request for LearnBridge', // Subject line
    text: `You requested a password reset. Click the link below to reset your password:\n\n${resetLink}\n\nIf you did not request this, please ignore this email. This link will expire in 1 hour.`, // Plain text body
    html: `<p>You requested a password reset. Click the link below to reset your password:</p>
           <p><a href="${resetLink}">${resetLink}</a></p>
           <p>If you did not request this, please ignore this email. This link will expire in 1 hour.</p>`, // HTML body
  };

  try {
    // Verify connection configuration on first use or periodically
    // await transporter.verify(); // Optional: verify connection config
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${toEmail}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending password reset email to ${toEmail}:`, error);
    throw new Error('Could not send password reset email.'); // Re-throw or handle as needed
  }
}

module.exports = {
  sendPasswordResetEmail,
};