// services/auth-service/services/accountLockoutService.js
const db = require('../db');
const config = require('../config');
const logger = require('../logger');

/**
 * Checks if a user account is currently locked out
 * @param {number} userId - The user ID to check
 * @returns {Promise<{isLocked: boolean, remainingTime: number|null}>} - Lock status and remaining time in ms
 */
async function isAccountLocked(userId) {
  try {
    const result = await db.query(
      'SELECT account_locked, lockout_until FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { isLocked: false, remainingTime: null };
    }

    const user = result.rows[0];
    
    // If account is not locked, return immediately
    if (!user.account_locked) {
      return { isLocked: false, remainingTime: null };
    }
    
    // If lockout has expired, unlock the account automatically
    if (user.lockout_until && new Date() > new Date(user.lockout_until)) {
      await unlockAccount(userId);
      return { isLocked: false, remainingTime: null };
    }
    
    // Account is locked, calculate remaining time
    const remainingTime = user.lockout_until 
      ? Math.max(0, new Date(user.lockout_until) - new Date()) 
      : null;
      
    return { 
      isLocked: true, 
      remainingTime 
    };
  } catch (error) {
    logger.error('Error checking account lock status:', error);
    // Default to not locked in case of error to prevent permanent lockouts
    return { isLocked: false, remainingTime: null };
  }
}

/**
 * Records a failed login attempt and locks the account if necessary
 * @param {number} userId - The user ID
 * @param {string} email - The email used in the attempt
 * @param {string} ipAddress - The IP address of the request
 * @param {string} userAgent - The user agent of the request
 * @param {string} reason - The reason for the failed attempt
 * @returns {Promise<{accountLocked: boolean, lockoutUntil: Date|null}>}
 */
async function recordFailedLoginAttempt(userId, email, ipAddress, userAgent, reason) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Record the failed attempt in login_attempts table
    await client.query(
      `INSERT INTO login_attempts 
       (user_id, email, ip_address, user_agent, success, failure_reason) 
       VALUES ($1, $2, $3, $4, FALSE, $5)`,
      [userId, email, ipAddress, userAgent, reason]
    );
    
    // Increment failed attempts counter
    const result = await client.query(
      `UPDATE users 
       SET failed_login_attempts = failed_login_attempts + 1 
       WHERE id = $1 
       RETURNING failed_login_attempts`,
      [userId]
    );
    
    const failedAttempts = result.rows[0]?.failed_login_attempts || 0;
    
    // Check if account should be locked
    if (failedAttempts >= config.accountLockout.maxFailedAttempts) {
      const lockoutUntil = new Date(Date.now() + config.accountLockout.lockoutDuration);
      
      await client.query(
        `UPDATE users 
         SET account_locked = TRUE, 
             lockout_until = $2 
         WHERE id = $1`,
        [userId, lockoutUntil]
      );
      
      logger.warn(`Account locked for user ${userId} until ${lockoutUntil} after ${failedAttempts} failed attempts`);
      
      await client.query('COMMIT');
      return { accountLocked: true, lockoutUntil };
    }
    
    await client.query('COMMIT');
    return { accountLocked: false, lockoutUntil: null };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording failed login attempt:', error);
    return { accountLocked: false, lockoutUntil: null };
  } finally {
    client.release();
  }
}

/**
 * Records a successful login attempt and resets failed attempts counter
 * @param {number} userId - The user ID
 * @param {string} email - The email used in the attempt
 * @param {string} ipAddress - The IP address of the request
 * @param {string} userAgent - The user agent of the request
 */
async function recordSuccessfulLogin(userId, email, ipAddress, userAgent) {
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Record the successful attempt
    await client.query(
      `INSERT INTO login_attempts 
       (user_id, email, ip_address, user_agent, success) 
       VALUES ($1, $2, $3, $4, TRUE)`,
      [userId, email, ipAddress, userAgent]
    );
    
    // Reset failed attempts counter and ensure account is unlocked
    await client.query(
      `UPDATE users 
       SET failed_login_attempts = 0, 
           account_locked = FALSE, 
           lockout_until = NULL 
       WHERE id = $1`,
      [userId]
    );
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording successful login:', error);
  } finally {
    client.release();
  }
}

/**
 * Manually unlocks a user account
 * @param {number} userId - The user ID to unlock
 */
async function unlockAccount(userId) {
  try {
    await db.query(
      `UPDATE users 
       SET account_locked = FALSE, 
           lockout_until = NULL, 
           failed_login_attempts = 0 
       WHERE id = $1`,
      [userId]
    );
    
    logger.info(`Account unlocked for user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error unlocking account for user ${userId}:`, error);
    return false;
  }
}

/**
 * Gets login history for a user
 * @param {number} userId - The user ID
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array>} - Array of login attempts
 */
async function getLoginHistory(userId, limit = 10) {
  try {
    const result = await db.query(
      `SELECT id, ip_address, user_agent, success, attempt_time, failure_reason 
       FROM login_attempts 
       WHERE user_id = $1 
       ORDER BY attempt_time DESC 
       LIMIT $2`,
      [userId, limit]
    );
    
    return result.rows;
  } catch (error) {
    logger.error(`Error fetching login history for user ${userId}:`, error);
    return [];
  }
}

module.exports = {
  isAccountLocked,
  recordFailedLoginAttempt,
  recordSuccessfulLogin,
  unlockAccount,
  getLoginHistory
};