const db = require('../../db');

class PLCService {
    async listCommunities() {
        const query = {
            text: `
                SELECT 
                    c.id,
                    c.name,
                    c.description,
                    c.community_type as type,
                    c.member_count,
                    array_agg(DISTINCT d.tags) as topics,
                    c.last_activity
                FROM plc_communities c
                LEFT JOIN discussions d ON c.id = d.community_id
                GROUP BY c.id, c.name, c.description, c.type, 
                         c.member_count, c.last_activity
                ORDER BY c.last_activity DESC
            `
        };
        
        return (await db.query(query)).rows;
    }

    async getCommunityDiscussions(communityId) {
        const query = {
            text: `
                SELECT 
                    d.id,
                    d.title,
                    d.content,
                    jsonb_build_object(
                        'id', d.author_id,
                        'name', d.author_name
                    ) as author,
                    d.created_at,
                    d.updated_at,
                    d.reply_count,
                    d.view_count,
                    d.like_count,
                    d.tags
                FROM discussions d
                WHERE d.community_id = $1
                ORDER BY d.updated_at DESC
            `,
            values: [communityId]
        };
        
        return (await db.query(query)).rows;
    }

    async createDiscussion(communityId, userId, userName, data) {
        const { title, content, tags } = data;

        const discussion = await db.query(
            `INSERT INTO discussions 
            (community_id, title, content, author_id, author_name, tags)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [communityId, title, content, userId, userName, tags]
        );

        // Update community discussion count and last activity
        await db.query(
            `UPDATE plc_communities 
            SET discussion_count = discussion_count + 1,
                last_activity = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [communityId]
        );

        return discussion.rows[0];
    }

    async addDiscussionReply(discussionId, userId, userName, content) {
        const reply = await db.query(
            `INSERT INTO discussion_replies
            (discussion_id, content, author_id, author_name)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [discussionId, content, userId, userName]
        );

        // Update discussion reply count and last activity
        await db.query(
            `UPDATE discussions
            SET reply_count = reply_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [discussionId]
        );

        // Update community last activity
        await db.query(
            `UPDATE plc_communities c
            SET last_activity = CURRENT_TIMESTAMP
            FROM discussions d
            WHERE d.id = $1 AND d.community_id = c.id`,
            [discussionId]
        );

        return reply.rows[0];
    }

    async shareResource(communityId, resourceId, userId) {
        // Check if resource exists and is sharable
        const resource = await db.query(
            `SELECT id FROM teaching_resources
            WHERE id = $1 AND (visibility = 'public' OR 
                  author_id = $2 OR 
                  $2 = ANY(collaborators))`,
            [resourceId, userId]
        );

        if (resource.rows.length === 0) {
            throw new Error('Resource not found or not sharable');
        }

        // Share the resource
        const shared = await db.query(
            `INSERT INTO shared_resources
            (community_id, resource_id, shared_by)
            VALUES ($1, $2, $3)
            ON CONFLICT (community_id, resource_id) DO NOTHING
            RETURNING *`,
            [communityId, resourceId, userId]
        );

        return shared.rows[0];
    }

    async getSharedResources(communityId) {
        const query = {
            text: `
                SELECT 
                    r.*,
                    sr.shared_by,
                    sr.shared_at
                FROM shared_resources sr
                JOIN teaching_resources r ON sr.resource_id = r.id
                WHERE sr.community_id = $1
                ORDER BY sr.shared_at DESC
            `,
            values: [communityId]
        };

        return (await db.query(query)).rows;
    }

    async joinCommunity(communityId, userId, role = 'member') {
        await db.query(
            `INSERT INTO community_memberships
            (community_id, user_id, role)
            VALUES ($1, $2, $3)
            ON CONFLICT (community_id, user_id) DO NOTHING`,
            [communityId, userId, role]
        );

        // Update member count
        await db.query(
            `UPDATE plc_communities
            SET member_count = member_count + 1
            WHERE id = $1`,
            [communityId]
        );
    }
}

module.exports = new PLCService();