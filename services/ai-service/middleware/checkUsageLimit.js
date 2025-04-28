// services/ai-service/middleware/checkUsageLimit.js
const usageLimitService = require('../services/usageLimitService');

/**
 * Middleware to check if a user has reached their usage limit for a service
 * @param {string} serviceName - The service to check limits for
 * @param {number} customLimit - Optional custom limit (overrides default)
 * @returns {Function} Express middleware function
 */
function checkUsageLimit(serviceName, customLimit = null) {
    return async (req, res, next) => {
        try {
            // Get user from the request (set by authenticateToken middleware)
            const user = req.user;
            
            if (!user || !user.userId) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }
            
            // Check if user has reached their limit
            const limitCheck = await usageLimitService.checkUserLimit(
                user, 
                serviceName,
                customLimit
            );
            
            // Store the limit info in the request for later use
            req.limitInfo = limitCheck;
            
            // If user has reached their limit, return 429 (Too Many Requests)
            if (limitCheck.hasReachedLimit) {
                return res.status(429).json({
                    error: 'Daily usage limit reached',
                    code: 'USAGE_LIMIT_REACHED',
                    limitInfo: limitCheck
                });
            }
            
            // User has not reached their limit, proceed
            next();
        } catch (error) {
            console.error('[CheckUsageLimit] Error:', error);
            // In case of error, allow the request to proceed (fail open)
            next();
        }
    };
}

module.exports = checkUsageLimit;
