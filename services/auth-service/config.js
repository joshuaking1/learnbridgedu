// services/auth-service/config.js
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3002,
  logLevel: process.env.LOG_LEVEL || 'info',

  // JWT Settings
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h', // Default to 1 hour
  },

  // Rate Limiting Settings (defaults match current implementation)
  rateLimit: {
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10,
      message: 'Too many login attempts from this IP, please try again after 15 minutes',
    },
    register: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5,
      message: 'Too many accounts created from this IP, please try again after an hour',
    },
    forgotPassword: {
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 5,
      message: 'Too many password reset requests from this IP, please try again later.',
    },
    resetPassword: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 8,
      message: 'Too many password reset attempts from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  },

  // Email Settings
  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER, // Default from address
    tlsRejectUnauthorized: process.env.NODE_ENV === 'production', // Stricter TLS in production
  },

  // Frontend URL (for password reset links)
  frontendUrl: process.env.FRONTEND_URL,

  // Database (if needed here, though db.js likely handles its own connection string)
  // db: {
  //   connectionString: process.env.DATABASE_URL,
  // },

  // bcrypt salt rounds
  bcryptSaltRounds: 10,
  
  // Account lockout settings
  accountLockout: {
    maxFailedAttempts: 5, // Lock account after this many consecutive failed attempts
    lockoutDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
    resetAttemptsAfter: 60 * 60 * 1000, // Reset failed attempts counter after 1 hour of no login attempts
  },

  // Two-factor authentication settings
  twoFactor: {
    // Token settings
    tokenLength: 6, // Length of the 2FA token
    tokenExpiry: 5 * 60 * 1000, // 5 minutes in milliseconds
    
    // Backup codes settings
    backupCodeCount: 10, // Number of backup codes to generate
    backupCodeLength: 10, // Length of each backup code
    
    // Rate limiting for 2FA attempts
    maxAttempts: 3, // Maximum number of failed 2FA attempts
    attemptWindow: 15 * 60 * 1000, // 15 minutes window for attempts
    
    // QR code settings
    qrCodeSize: 200, // Size of QR code image in pixels
    issuer: 'LearnBridge', // Name shown in authenticator apps
  },
  
  // Password reset settings
  passwordReset: {
    tokenExpiry: 30 * 60 * 1000, // 30 minutes in milliseconds (shorter than default 1 hour)
    tokenLength: 64, // Length of the reset token in bytes before hex encoding
    enforcePasswordHistory: true, // Whether to prevent reuse of previous passwords
    passwordHistoryLimit: 5, // Number of previous passwords to remember
  },
};

// --- Validation ---
// Ensure critical secrets are set
if (!config.jwt.secret) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
  process.exit(1); // Exit if secret is missing
}
if (!config.email.auth.user || !config.email.auth.pass || !config.email.host) {
    console.warn("WARNING: Email service configuration is incomplete. Password reset emails may fail.");
    // Don't exit, but warn loudly
}
if (!config.frontendUrl) {
    console.warn("WARNING: FRONTEND_URL is not set. Password reset links will not work correctly.");
}


module.exports = config;