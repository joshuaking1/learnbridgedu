const db = require('../../db');

class RecommendationService {
    async getRecommendations(userId, filters = {}) {
        const { subject, grade, resourceType } = filters;
        
        // Get user preferences
        const userPrefs = await this.getUserPreferences(userId);
        
        // Build recommendation query with filters
        const query = {
            text: `
                WITH resource_scores AS (
                    SELECT 
                        r.id,
                        r.title,
                        r.description,
                        r.resource_type,
                        r.subject,
                        r.grade_level,
                        r.average_rating * 0.3 +
                        (CASE WHEN r.subject = ANY($1::text[]) THEN 0.3 ELSE 0 END) +
                        (CASE WHEN r.grade_level && $2::text[] THEN 0.2 ELSE 0 END) +
                        (CASE WHEN r.resource_type = ANY($3::text[]) THEN 0.2 ELSE 0 END) as match_score
                    FROM teaching_resources r
                    WHERE ($4::text IS NULL OR r.subject = $4)
                    AND ($5::text IS NULL OR $5 = ANY(r.grade_level))
                    AND ($6::text IS NULL OR r.resource_type = $6)
                    AND r.visibility = 'public'
                )
                SELECT 
                    rs.*,
                    array_agg(DISTINCT keywords) as tags
                FROM resource_scores rs
                LEFT JOIN teaching_resources tr ON rs.id = tr.id
                WHERE match_score > 0
                GROUP BY rs.id, rs.title, rs.description, rs.resource_type, 
                         rs.subject, rs.grade_level, rs.match_score
                ORDER BY match_score DESC
                LIMIT 10
            `,
            values: [
                userPrefs.preferred_subjects || [],
                userPrefs.preferred_grade_levels || [],
                userPrefs.preferred_resource_types || [],
                subject,
                grade,
                resourceType
            ]
        };

        const result = await db.query(query);
        
        // Track recommendations
        await this.trackRecommendations(userId, result.rows);
        
        return result.rows;
    }

    async getUserPreferences(userId) {
        const query = {
            text: 'SELECT * FROM user_preferences WHERE user_id = $1',
            values: [userId]
        };
        
        const result = await db.query(query);
        return result.rows[0] || {
            preferred_subjects: [],
            preferred_grade_levels: [],
            preferred_resource_types: []
        };
    }

    async trackRecommendations(userId, recommendations) {
        const query = {
            text: `
                INSERT INTO recommendation_history 
                (user_id, resource_id, match_score)
                SELECT $1, id, match_score
                FROM unnest($2::uuid[], $3::decimal[])
                AS t(id, match_score)
            `,
            values: [
                userId,
                recommendations.map(r => r.id),
                recommendations.map(r => r.match_score)
            ]
        };
        
        await db.query(query);
    }

    async submitFeedback(userId, recommendationId, feedback) {
        const { helpful, comments } = feedback;
        
        const query = {
            text: `
                INSERT INTO resource_interactions 
                (user_id, resource_id, interaction_type, helpful, feedback)
                VALUES ($1, $2, 'feedback', $3, $4)
            `,
            values: [userId, recommendationId, helpful, comments]
        };
        
        await db.query(query);
        
        // Update recommendation click status if helpful
        if (helpful) {
            await db.query(`
                UPDATE recommendation_history
                SET clicked = true
                WHERE user_id = $1 AND resource_id = $2
            `, [userId, recommendationId]);
        }
    }

    async getRecommendationsBySubject(subject) {
        const query = {
            text: `
                SELECT 
                    id, title, description, resource_type,
                    subject, grade_level,
                    average_rating as rating,
                    keywords as tags
                FROM teaching_resources
                WHERE subject = $1
                AND visibility = 'public'
                ORDER BY average_rating DESC, views DESC
                LIMIT 10
            `,
            values: [subject]
        };
        
        return (await db.query(query)).rows;
    }

    async createRecommendation(userId, authorName, recommendationData) {
        const {
            title,
            description,
            resource_type,
            subject,
            grade_level,
            content_format,
            content_data,
            keywords,
            visibility = 'public' // Default to public, can be overridden
        } = recommendationData;

        const query = {
            text: `
                INSERT INTO teaching_resources (
                    title, description, resource_type, subject, grade_level,
                    author_id, author_name, content_format, content_data, keywords, visibility,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
                ) RETURNING *
            `,
            values: [
                title, description, resource_type, subject, grade_level,
                userId, authorName, content_format, content_data, keywords, visibility
            ]
        };
        const result = await db.query(query);
        return result.rows[0];
    }

    async getRecommendationById(recommendationId) {
        const query = {
            text: `
                SELECT
                    r.*,
                    u.name as author_display_name
                FROM teaching_resources r
                LEFT JOIN users u ON r.author_id = u.id
                WHERE r.id = $1
            `, // Assuming a 'users' table with 'name' for author_display_name
            values: [recommendationId]
        };
        const result = await db.query(query);
        if (result.rows.length === 0) {
            return null; // Or throw an error: throw new Error('Recommendation not found');
        }
        // Increment view count
        await db.query('UPDATE teaching_resources SET views = views + 1 WHERE id = $1', [recommendationId]);
        return result.rows[0];
    }

    async updateRecommendation(recommendationId, userId, recommendationData) {
        const {
            title, description, resource_type, subject, grade_level,
            content_format, content_data, keywords, visibility
        } = recommendationData;

        // First, verify the user is the author of the recommendation
        const verifyQuery = {
            text: 'SELECT author_id FROM teaching_resources WHERE id = $1',
            values: [recommendationId]
        };
        const verifyResult = await db.query(verifyQuery);

        if (verifyResult.rows.length === 0) {
            throw new Error('Recommendation not found');
        }
        if (verifyResult.rows[0].author_id !== userId) {
            throw new Error('User not authorized to update this recommendation');
        }

        // Construct dynamic SET clause for the update
        const fieldsToUpdate = [];
        const values = [];
        let valueIndex = 1;

        if (title !== undefined) { fieldsToUpdate.push(`title = $${valueIndex++}`); values.push(title); }
        if (description !== undefined) { fieldsToUpdate.push(`description = $${valueIndex++}`); values.push(description); }
        if (resource_type !== undefined) { fieldsToUpdate.push(`resource_type = $${valueIndex++}`); values.push(resource_type); }
        if (subject !== undefined) { fieldsToUpdate.push(`subject = $${valueIndex++}`); values.push(subject); }
        if (grade_level !== undefined) { fieldsToUpdate.push(`grade_level = $${valueIndex++}`); values.push(grade_level); }
        if (content_format !== undefined) { fieldsToUpdate.push(`content_format = $${valueIndex++}`); values.push(content_format); }
        if (content_data !== undefined) { fieldsToUpdate.push(`content_data = $${valueIndex++}`); values.push(content_data); }
        if (keywords !== undefined) { fieldsToUpdate.push(`keywords = $${valueIndex++}`); values.push(keywords); }
        if (visibility !== undefined) { fieldsToUpdate.push(`visibility = $${valueIndex++}`); values.push(visibility); }

        if (fieldsToUpdate.length === 0) {
            // If no fields to update, just return the current recommendation
            return this.getRecommendationById(recommendationId);
        }

        fieldsToUpdate.push(`updated_at = NOW()`);
        values.push(recommendationId); // For the WHERE clause

        const query = {
            text: `
                UPDATE teaching_resources
                SET ${fieldsToUpdate.join(', ')}
                WHERE id = $${valueIndex}
                RETURNING *
            `,
            values: values
        };

        const result = await db.query(query);
        if (result.rows.length === 0) {
            // This case should ideally be caught by the initial verification
            throw new Error('Recommendation not found or update failed');
        }
        return result.rows[0];
    }

    async deleteRecommendation(recommendationId, userId) {
        // First, verify the user is the author of the recommendation
        const verifyQuery = {
            text: 'SELECT author_id FROM teaching_resources WHERE id = $1',
            values: [recommendationId]
        };
        const verifyResult = await db.query(verifyQuery);

        if (verifyResult.rows.length === 0) {
            throw new Error('Recommendation not found');
        }
        if (verifyResult.rows[0].author_id !== userId) {
            throw new Error('User not authorized to delete this recommendation');
        }

        // Assuming ON DELETE CASCADE is set or no restrictive FKs for simplicity here.
        const query = {
            text: 'DELETE FROM teaching_resources WHERE id = $1 RETURNING *',
            values: [recommendationId]
        };
        const result = await db.query(query);

        if (result.rowCount === 0) {
            // This case should ideally be caught by the initial verification
            throw new Error('Recommendation not found or delete failed');
        }
        return { message: 'Recommendation deleted successfully', deletedRecommendation: result.rows[0] };
    }
}

module.exports = new RecommendationService();