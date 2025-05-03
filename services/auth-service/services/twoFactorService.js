// services/auth-service/services/twoFactorService.js
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const logger = require('../logger');

/**
 * Generate backup codes for a user
 * @returns {Promise<string[]>} Array of backup codes
 */
async function generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < config.twoFactor.backupCodeCount; i++) {
        const code = crypto.randomBytes(Math.ceil(config.twoFactor.backupCodeLength / 2))
            .toString('hex')
            .slice(0, config.twoFactor.backupCodeLength)
            .toUpperCase();
        codes.push(code);
    }
    return codes;
}

/**
 * Initialize 2FA for a user
 * @param {number} userId - The user's ID
 * @param {string} email - The user's email
 * @returns {Promise<{secret: string, otpauthUrl: string, qrCodeUrl: string, backupCodes: string[]}>}
 */
async function initialize2FA(userId, email) {
    try {
        // Generate secret
        const secret = speakeasy.generateSecret({
            length: 20,
            name: `${config.twoFactor.issuer}:${email}`,
            issuer: config.twoFactor.issuer
        });

        // Generate backup codes
        const backupCodes = await generateBackupCodes();
        
        // Hash backup codes for storage
        const hashedCodes = backupCodes.map(code => 
            crypto.createHash('sha256').update(code).digest('hex')
        );

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Store secret and hashed backup codes
            await client.query(
                `UPDATE users 
                 SET two_factor_secret = $1, 
                     two_factor_backup_codes = $2 
                 WHERE id = $3`,
                [secret.base32, JSON.stringify(hashedCodes), userId]
            );

            // Generate QR code
            const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url, {
                width: config.twoFactor.qrCodeSize
            });

            await client.query('COMMIT');

            return {
                secret: secret.base32,
                otpauthUrl: secret.otpauth_url,
                qrCodeUrl,
                backupCodes
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        logger.error('Error initializing 2FA:', error);
        throw new Error('Failed to initialize two-factor authentication');
    }
}

/**
 * Enable 2FA for a user after they've verified their first token
 * @param {number} userId - The user's ID
 * @returns {Promise<void>}
 */
async function enable2FA(userId) {
    try {
        await db.query(
            'UPDATE users SET two_factor_enabled = TRUE WHERE id = $1',
            [userId]
        );
    } catch (error) {
        logger.error('Error enabling 2FA:', error);
        throw new Error('Failed to enable two-factor authentication');
    }
}

/**
 * Disable 2FA for a user
 * @param {number} userId - The user's ID
 * @returns {Promise<void>}
 */
async function disable2FA(userId) {
    try {
        await db.query(
            `UPDATE users 
             SET two_factor_enabled = FALSE,
                 two_factor_secret = NULL,
                 two_factor_backup_codes = NULL
             WHERE id = $1`,
            [userId]
        );
    } catch (error) {
        logger.error('Error disabling 2FA:', error);
        throw new Error('Failed to disable two-factor authentication');
    }
}

/**
 * Verify a 2FA token
 * @param {number} userId - The user's ID
 * @param {string} token - The token to verify
 * @param {string} ipAddress - The IP address of the request
 * @param {string} userAgent - The user agent of the request
 * @returns {Promise<boolean>} Whether the token is valid
 */
async function verifyToken(userId, token, ipAddress, userAgent) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Get user's 2FA secret and verify it's enabled
        const result = await client.query(
            'SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1',
            [userId]
        );

        const user = result.rows[0];
        if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
            throw new Error('Two-factor authentication is not enabled');
        }

        // Check rate limiting
        const recentAttempts = await client.query(
            `SELECT COUNT(*) FROM two_factor_attempts 
             WHERE user_id = $1 
             AND success = FALSE 
             AND attempt_time > NOW() - INTERVAL '15 minutes'`,
            [userId]
        );

        if (recentAttempts.rows[0].count >= config.twoFactor.maxAttempts) {
            throw new Error('Too many failed attempts. Please try again later.');
        }

        // Verify token
        const isValid = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token,
            window: 1 // Allow 30 seconds of time drift
        });

        // Record the attempt
        await client.query(
            `INSERT INTO two_factor_attempts (user_id, ip_address, user_agent, success, failure_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, ipAddress, userAgent, isValid, isValid ? null : 'Invalid token']
        );

        await client.query('COMMIT');
        return isValid;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Verify a backup code
 * @param {number} userId - The user's ID
 * @param {string} code - The backup code to verify
 * @returns {Promise<boolean>} Whether the code is valid
 */
async function verifyBackupCode(userId, code) {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        // Get user's backup codes
        const result = await client.query(
            'SELECT two_factor_backup_codes FROM users WHERE id = $1',
            [userId]
        );

        const user = result.rows[0];
        if (!user || !user.two_factor_backup_codes) {
            return false;
        }

        // Hash the provided code
        const hashedCode = crypto.createHash('sha256').update(code).digest('hex');
        
        // Check if code exists and remove it if it does
        const backupCodes = user.two_factor_backup_codes;
        const index = backupCodes.indexOf(hashedCode);
        
        if (index === -1) {
            await client.query('COMMIT');
            return false;
        }

        // Remove the used code
        backupCodes.splice(index, 1);
        
        // Update backup codes in database
        await client.query(
            'UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2',
            [JSON.stringify(backupCodes), userId]
        );

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error verifying backup code:', error);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Get remaining backup codes for a user
 * @param {number} userId - The user's ID
 * @returns {Promise<number>} Number of remaining backup codes
 */
async function getRemainingBackupCodes(userId) {
    try {
        const result = await db.query(
            'SELECT two_factor_backup_codes FROM users WHERE id = $1',
            [userId]
        );

        const user = result.rows[0];
        if (!user || !user.two_factor_backup_codes) {
            return 0;
        }

        return user.two_factor_backup_codes.length;
    } catch (error) {
        logger.error('Error getting remaining backup codes:', error);
        throw new Error('Failed to get remaining backup codes');
    }
}

module.exports = {
    initialize2FA,
    enable2FA,
    disable2FA,
    verifyToken,
    verifyBackupCode,
    getRemainingBackupCodes
};