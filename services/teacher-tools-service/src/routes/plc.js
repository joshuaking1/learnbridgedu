const express = require('express');
const router = express.Router();
const plcService = require('../services/plcService');
const authenticateToken = require('../../middleware/authenticateToken');

/**
 * GET /api/plc/communities
 * List available PLCs
 */
router.get('/communities', authenticateToken, async (req, res) => {
    try {
        const communities = await plcService.listCommunities();
        res.json(communities);
    } catch (error) {
        console.error('Error listing communities:', error);
        res.status(500).json({ error: 'Failed to fetch communities' });
    }
});

/**
 * GET /api/plc/communities/:id/discussions
 * Get discussions within a PLC
 */
router.get('/communities/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const discussions = await plcService.getCommunityDiscussions(id);
        res.json(discussions);
    } catch (error) {
        console.error('Error getting discussions:', error);
        res.status(500).json({ error: 'Failed to fetch discussions' });
    }
});

/**
 * POST /api/plc/communities/:id/discussions
 * Create new discussion
 */
router.post('/communities/:id/discussions', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, tags } = req.body;
        
        const discussion = await plcService.createDiscussion(
            id,
            req.user.id,
            req.user.name,
            { title, content, tags }
        );
        
        res.json(discussion);
    } catch (error) {
        console.error('Error creating discussion:', error);
        res.status(500).json({ error: 'Failed to create discussion' });
    }
});

/**
 * POST /api/plc/communities/:id/join
 * Join a PLC community
 */
router.post('/communities/:id/join', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await plcService.joinCommunity(id, req.user.id);
        res.json({ message: 'Successfully joined community' });
    } catch (error) {
        console.error('Error joining community:', error);
        res.status(500).json({ error: 'Failed to join community' });
    }
});

/**
 * POST /api/plc/discussions/:id/replies
 * Add reply to a discussion
 */
router.post('/discussions/:id/replies', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        
        const reply = await plcService.addDiscussionReply(
            id,
            req.user.id,
            req.user.name,
            content
        );
        
        res.json(reply);
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({ error: 'Failed to add reply' });
    }
});

/**
 * POST /api/plc/communities/:id/share
 * Share a resource in the community
 */
router.post('/communities/:id/share', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { resourceId } = req.body;
        
        const shared = await plcService.shareResource(
            id,
            resourceId,
            req.user.id
        );
        
        res.json(shared);
    } catch (error) {
        console.error('Error sharing resource:', error);
        res.status(500).json({ error: 'Failed to share resource' });
    }
});

/**
 * GET /api/plc/communities/:id/resources
 * Get shared resources in a community
 */
router.get('/communities/:id/resources', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const resources = await plcService.getSharedResources(id);
        res.json(resources);
    } catch (error) {
        console.error('Error getting shared resources:', error);
        res.status(500).json({ error: 'Failed to fetch shared resources' });
    }
});

module.exports = router;