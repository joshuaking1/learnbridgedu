// services/teacher-tools-service/services/usageLimitService.js
const db = require('../db');

/**
 * Service for managing user usage limits
 */
class UsageLimitService {
    constructor() {
        // Default daily limit for regular users
        this.DEFAULT_DAILY_LIMIT = 3;
        
        // Service names for tracking
        this.SERVICES = {
            LESSON_PLAN: 'lesson_plan',
            ASSESSMENT: 'assessment',
            RUBRIC: 'rubric',
            TABLE_OF_SPECIFICATION: 'table_of_specification',
            // Add more services as needed
        };
    }
    
    /**
     * Check if a user has reached their daily limit for a service
     * @param {string} userId - User ID
     * @param {string} serviceName - Service name to check
     * @param {number} customLimit - Optional custom limit (overrides default)
     * @returns {Promise<Object>} Object with hasReachedLimit and currentUsage properties
     */
    async checkUserLimit(userId, serviceName, customLimit = null) {
        try {
            // Admin users have no limits
            if (this.isAdminUser(userId)) {
                return {
                    hasReachedLimit: false,
                    currentUsage: 0,
                    limit: Infinity,
                    remaining: Infinity
                };
            }
            
            const limit = customLimit || this.DEFAULT_DAILY_LIMIT;
            
            // Get current usage for today
            const query = `
                SELECT usage_count 
                FROM usage_limits 
                WHERE user_id = $1 
                AND service_name = $2 
                AND usage_date = CURRENT_DATE;
            `;
            
            const { rows } = await db.query(query, [userId, serviceName]);
            
            const currentUsage = rows.length > 0 ? rows[0].usage_count : 0;
            const hasReachedLimit = currentUsage >= limit;
            const remaining = Math.max(0, limit - currentUsage);
            
            return {
                hasReachedLimit,
                currentUsage,
                limit,
                remaining
            };
        } catch (error) {
            console.error(`[UsageLimitService] Error checking limit for user ${userId}:`, error);
            // In case of error, allow the operation (fail open for better UX)
            return {
                hasReachedLimit: false,
                currentUsage: 0,
                limit: this.DEFAULT_DAILY_LIMIT,
                remaining: this.DEFAULT_DAILY_LIMIT,
                error: error.message
            };
        }
    }
    
    /**
     * Record usage of a service by a user
     * @param {string} userId - User ID
     * @param {string} serviceName - Service name
     * @returns {Promise<Object>} Updated usage information
     */
    async recordUsage(userId, serviceName) {
        try {
            // Admin users have no limits, so don't record their usage
            if (this.isAdminUser(userId)) {
                return {
                    recorded: false,
                    message: 'Admin usage not recorded',
                    currentUsage: 0,
                    limit: Infinity,
                    remaining: Infinity
                };
            }
            
            // Upsert the usage record
            const query = `
                INSERT INTO usage_limits (user_id, service_name, usage_count)
                VALUES ($1, $2, 1)
                ON CONFLICT (user_id, service_name, usage_date)
                DO UPDATE SET 
                    usage_count = usage_limits.usage_count + 1,
                    updated_at = NOW()
                RETURNING usage_count;
            `;
            
            const { rows } = await db.query(query, [userId, serviceName]);
            const currentUsage = rows[0].usage_count;
            const remaining = Math.max(0, this.DEFAULT_DAILY_LIMIT - currentUsage);
            
            return {
                recorded: true,
                currentUsage,
                limit: this.DEFAULT_DAILY_LIMIT,
                remaining
            };
        } catch (error) {
            console.error(`[UsageLimitService] Error recording usage for user ${userId}:`, error);
            return {
                recorded: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get usage statistics for a user
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Usage statistics for all services
     */
    async getUserUsageStats(userId) {
        try {
            // Admin users have no limits
            if (this.isAdminUser(userId)) {
                return {
                    isAdmin: true,
                    services: Object.values(this.SERVICES).map(service => ({
                        service,
                        currentUsage: 0,
                        limit: Infinity,
                        remaining: Infinity
                    }))
                };
            }
            
            // Get usage for all services for today
            const query = `
                SELECT service_name, usage_count 
                FROM usage_limits 
                WHERE user_id = $1 
                AND usage_date = CURRENT_DATE;
            `;
            
            const { rows } = await db.query(query, [userId]);
            
            // Create a map of service usage
            const usageMap = rows.reduce((map, row) => {
                map[row.service_name] = row.usage_count;
                return map;
            }, {});
            
            // Build the response with all services
            const services = Object.values(this.SERVICES).map(service => {
                const currentUsage = usageMap[service] || 0;
                return {
                    service,
                    currentUsage,
                    limit: this.DEFAULT_DAILY_LIMIT,
                    remaining: Math.max(0, this.DEFAULT_DAILY_LIMIT - currentUsage)
                };
            });
            
            return {
                isAdmin: false,
                services
            };
        } catch (error) {
            console.error(`[UsageLimitService] Error getting usage stats for user ${userId}:`, error);
            return {
                error: error.message
            };
        }
    }
    
    /**
     * Check if a user is an admin
     * @param {string} userId - User ID or user object
     * @returns {boolean} True if admin
     */
    isAdminUser(userId) {
        // If userId is an object (from JWT), check role property
        if (typeof userId === 'object' && userId.role) {
            return userId.role === 'admin';
        }
        
        // For service accounts, check if it ends with -service
        if (typeof userId === 'string' && userId.endsWith('-service')) {
            return true;
        }
        
        // Add any other admin detection logic here
        return false;
    }
}

module.exports = new UsageLimitService();
