// Centralized error messages for authentication service
module.exports = {
  // Validation errors (400)
  VALIDATION: {
    INVALID_EMAIL: {
      code: 'AUTH4001',
      message: 'Please provide a valid email address.'
    },
    PASSWORD_REQUIREMENTS: {
      code: 'AUTH4002',
      message: 'Password must be at least 8 characters long and contain at least one number, one lowercase letter, one uppercase letter, and one special character.'
    },
    MISSING_FIELDS: {
      code: 'AUTH4003',
      message: 'First name, surname, and email are required fields.'
    },
    INVALID_PHONE: {
      code: 'AUTH4004', 
      message: 'Invalid phone number format.'
    },
    INVALID_GENDER: {
      code: 'AUTH4005',
      message: 'Invalid gender value. Must be one of: Male, Female, Other, Prefer not to say.'
    }
  },

  // Authentication errors (401)
  AUTHENTICATION: {
    INVALID_CREDENTIALS: {
      code: 'AUTH4011',
      message: 'Invalid email or password.'
    },
    ACCOUNT_LOCKED: {
      code: 'AUTH4012',
      message: 'Account is locked due to too many failed attempts. Try again in {minutes} minute(s).'
    },
    ACCOUNT_LOCKED_CONTACT_SUPPORT: {
      code: 'AUTH4013',
      message: 'Account is locked due to too many failed attempts. Contact support for assistance.'
    },
    TWO_FACTOR_REQUIRED: {
      code: 'AUTH4014',
      message: 'Two-factor authentication required.'
    },
    TWO_FACTOR_INVALID: {
      code: 'AUTH4015',
      message: 'Invalid two-factor authentication code.'
    }
  },

  // Authorization errors (403)
  AUTHORIZATION: {
    INVALID_ROLE: {
      code: 'AUTH4031',
      message: 'Invalid role selection.'
    },
    ROLE_REQUIREMENTS: {
      code: 'AUTH4032',
      message: 'Role selection does not meet requirements.'
    }
  },

  // Not found errors (404)
  NOT_FOUND: {
    USER_NOT_FOUND: {
      code: 'AUTH4041',
      message: 'User not found.'
    },
    TOKEN_NOT_FOUND: {
      code: 'AUTH4042',
      message: 'Invalid or expired token.'
    }
  },

  // Conflict errors (409)
  CONFLICT: {
    EMAIL_EXISTS: {
      code: 'AUTH4091',
      message: 'User with this email already exists.'
    }
  },

  // Server errors (500)
  SERVER: {
    INTERNAL_ERROR: {
      code: 'AUTH5001',
      message: 'An internal server error occurred. Please try again later.'
    },
    DATABASE_ERROR: {
      code: 'AUTH5002',
      message: 'A database error occurred. Please try again later.'
    }
  }
};