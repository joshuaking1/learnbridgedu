// services/learning-path-service/middleware/checkUsageLimit.js
const usageLimitService = require('../services/usageLimitService');

/**
 * Middleware to check if a user has reached their daily limit for a service
 * @param {string} serviceName - Name of the service to check
 * @returns {function} Middleware function
 */
function checkUsageLimit(serviceName) {
    return async (req, res, next) => {
        try {
            // Check if user has reached their limit
            const limitInfo = await usageLimitService.checkUserLimit(req.user, serviceName);
            
            // Store limit info in request for later use
            req.limitInfo = limitInfo;
            
            // If user is admin or hasn't reached limit, proceed
            if (limitInfo.isAdmin || !limitInfo.hasReachedLimit) {
                next();
            } else {
                // User has reached their limit
                console.log(`[LearningPathService] User ${req.user.userId} has reached daily limit for ${serviceName}`);
                res.status(429).json({
                    error: 'Daily usage limit reached',
                    limitInfo: {
                        service: serviceName,
                        currentUsage: limitInfo.currentUsage,
                        limit: limitInfo.limit,
                        remaining: limitInfo.remaining
                    }
                });
            }
        } catch (error) {
            console.error(`[LearningPathService] Error checking usage limit:`, error);
            // In case of error, allow the operation but log the error
            next();
        }
    };
}

module.exports = checkUsageLimit;
