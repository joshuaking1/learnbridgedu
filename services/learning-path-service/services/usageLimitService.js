// services/learning-path-service/services/usageLimitService.js
const db = require('../db');

// Define service names for usage tracking
const SERVICES = {
    VIEW_LEARNING_PATH: 'view_learning_path',
    GENERATE_RECOMMENDATIONS: 'generate_recommendations',
    COMPLETE_SKILL: 'complete_skill',
    UNLOCK_ACHIEVEMENT: 'unlock_achievement',
    TRACK_PROGRESS: 'track_progress'
};

// Default daily limits for each service
const DEFAULT_DAILY_LIMITS = {
    [SERVICES.VIEW_LEARNING_PATH]: 10,
    [SERVICES.GENERATE_RECOMMENDATIONS]: 3,
    [SERVICES.COMPLETE_SKILL]: 10,
    [SERVICES.UNLOCK_ACHIEVEMENT]: 10,
    [SERVICES.TRACK_PROGRESS]: 20
};

/**
 * Check if a user has reached their daily limit for a service
 * @param {Object} user - User object from JWT token
 * @param {string} serviceName - Name of the service to check
 * @returns {Promise<Object>} Object with limit info
 */
async function checkUserLimit(user, serviceName) {
    // Admin users have no limits
    if (user.role === 'admin') {
        return {
            isAdmin: true,
            hasReachedLimit: false,
            currentUsage: 0,
            limit: null,
            remaining: null
        };
    }

    const userId = user.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    try {
        // Get current usage for today
        const query = `
            SELECT usage_count 
            FROM usage_limits 
            WHERE user_id = $1 AND service_name = $2 AND usage_date = $3
        `;
        const { rows } = await db.query(query, [userId, serviceName, today]);
        
        const currentUsage = rows.length > 0 ? rows[0].usage_count : 0;
        const limit = DEFAULT_DAILY_LIMITS[serviceName] || 3; // Default to 3 if not specified
        const remaining = Math.max(0, limit - currentUsage);
        const hasReachedLimit = currentUsage >= limit;

        return {
            isAdmin: false,
            hasReachedLimit,
            currentUsage,
            limit,
            remaining
        };
    } catch (error) {
        console.error(`[LearningPathService] Error checking usage limit for user ${userId}, service ${serviceName}:`, error);
        // In case of error, allow the operation but log the error
        return {
            isAdmin: false,
            hasReachedLimit: false,
            currentUsage: 0,
            limit: DEFAULT_DAILY_LIMITS[serviceName] || 3,
            remaining: DEFAULT_DAILY_LIMITS[serviceName] || 3,
            error: error.message
        };
    }
}

/**
 * Record usage of a service for a user
 * @param {Object} user - User object from JWT token
 * @param {string} serviceName - Name of the service to record
 * @returns {Promise<boolean>} Success status
 */
async function recordUsage(user, serviceName) {
    // Admin users don't count towards usage limits
    if (user.role === 'admin') {
        return true;
    }

    const userId = user.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    try {
        // Insert or update usage record
        const query = `
            INSERT INTO usage_limits (user_id, service_name, usage_date, usage_count)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (user_id, service_name, usage_date)
            DO UPDATE SET 
                usage_count = usage_limits.usage_count + 1,
                updated_at = NOW()
            RETURNING usage_count
        `;
        const { rows } = await db.query(query, [userId, serviceName, today]);
        
        console.log(`[LearningPathService] Recorded usage for user ${userId}, service ${serviceName}. New count: ${rows[0].usage_count}`);
        return true;
    } catch (error) {
        console.error(`[LearningPathService] Error recording usage for user ${userId}, service ${serviceName}:`, error);
        return false;
    }
}

/**
 * Get usage limits for all services for a user
 * @param {Object} user - User object from JWT token
 * @returns {Promise<Object>} Object with usage info for all services
 */
async function getAllServiceLimits(user) {
    // Admin users have no limits
    if (user.role === 'admin') {
        return {
            isAdmin: true,
            services: Object.values(SERVICES).map(service => ({
                service,
                currentUsage: 0,
                limit: null,
                remaining: null
            }))
        };
    }

    const userId = user.userId;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    try {
        // Get current usage for all services today
        const query = `
            SELECT service_name, usage_count 
            FROM usage_limits 
            WHERE user_id = $1 AND usage_date = $2
        `;
        const { rows } = await db.query(query, [userId, today]);
        
        // Create a map of service name to usage count
        const usageMap = {};
        rows.forEach(row => {
            usageMap[row.service_name] = row.usage_count;
        });
        
        // Create result object with all services
        const services = Object.values(SERVICES).map(service => {
            const currentUsage = usageMap[service] || 0;
            const limit = DEFAULT_DAILY_LIMITS[service] || 3;
            const remaining = Math.max(0, limit - currentUsage);
            
            return {
                service,
                currentUsage,
                limit,
                remaining
            };
        });

        return {
            isAdmin: false,
            services
        };
    } catch (error) {
        console.error(`[LearningPathService] Error getting all service limits for user ${userId}:`, error);
        // In case of error, return default values
        return {
            isAdmin: false,
            services: Object.values(SERVICES).map(service => ({
                service,
                currentUsage: 0,
                limit: DEFAULT_DAILY_LIMITS[service] || 3,
                remaining: DEFAULT_DAILY_LIMITS[service] || 3,
                error: error.message
            })),
            error: error.message
        };
    }
}

module.exports = {
    SERVICES,
    DEFAULT_DAILY_LIMITS,
    checkUserLimit,
    recordUsage,
    getAllServiceLimits
};
