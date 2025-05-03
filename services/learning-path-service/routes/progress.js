// services/learning-path-service/routes/progress.js
const express = require('express');
const db = require('../db');
const router = express.Router();
const usageLimitService = require('../services/usageLimitService');
const checkUsageLimit = require('../middleware/checkUsageLimit');

// --- Get User Progress Summary ---
// GET /api/learning-paths/progress/summary
router.get('/summary', async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get progress summary for user ${userId}`);
    
    try {
        // Get learning paths progress
        const pathsQuery = `
            SELECT 
                COUNT(*) as total_paths,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_paths,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_paths,
                COALESCE(AVG(progress_percentage), 0) as avg_progress
            FROM user_learning_paths
            WHERE user_id = $1
        `;
        
        const { rows: pathsRows } = await db.query(pathsQuery, [userId]);
        
        // Get skills progress
        const skillsQuery = `
            SELECT 
                COUNT(*) as total_skills,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_skills,
                COUNT(CASE WHEN status = 'mastered' THEN 1 END) as mastered_skills,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_skills,
                COALESCE(SUM(points_earned), 0) as total_points
            FROM user_skills
            WHERE user_id = $1
        `;
        
        const { rows: skillsRows } = await db.query(skillsQuery, [userId]);
        
        // Get achievements progress
        const achievementsQuery = `
            SELECT 
                COUNT(*) as unlocked_achievements,
                COALESCE(SUM(points_earned), 0) as achievement_points
            FROM user_achievements
            WHERE user_id = $1
        `;
        
        const { rows: achievementsRows } = await db.query(achievementsQuery, [userId]);
        
        // Get total available achievements
        const totalAchievementsQuery = `
            SELECT COUNT(*) as total_achievements
            FROM achievements
            WHERE is_active = TRUE
        `;
        
        const { rows: totalAchievementsRows } = await db.query(totalAchievementsQuery);
        
        // Get subject progress
        const subjectsQuery = `
            SELECT 
                lp.subject,
                COUNT(ulp.*) as path_count,
                COALESCE(AVG(ulp.progress_percentage), 0) as avg_progress
            FROM user_learning_paths ulp
            JOIN learning_paths lp ON ulp.learning_path_id = lp.id
            WHERE ulp.user_id = $1
            GROUP BY lp.subject
            ORDER BY avg_progress DESC
        `;
        
        const { rows: subjectsRows } = await db.query(subjectsQuery, [userId]);
        
        // Get recent activity
        const recentActivityQuery = `
            (SELECT 
                'learning_path' as activity_type,
                lp.title as title,
                ulp.learning_path_id as item_id,
                ulp.status,
                ulp.progress_percentage,
                ulp.last_activity_at as activity_date
            FROM user_learning_paths ulp
            JOIN learning_paths lp ON ulp.learning_path_id = lp.id
            WHERE ulp.user_id = $1)
            
            UNION ALL
            
            (SELECT 
                'skill' as activity_type,
                s.title as title,
                us.skill_id as item_id,
                us.status,
                us.progress_percentage,
                us.last_activity_at as activity_date
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.id
            WHERE us.user_id = $1)
            
            UNION ALL
            
            (SELECT 
                'achievement' as activity_type,
                a.title as title,
                a.id as item_id,
                'completed' as status,
                100 as progress_percentage,
                ua.unlocked_at as activity_date
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = $1)
            
            ORDER BY activity_date DESC
            LIMIT 10
        `;
        
        const { rows: recentActivityRows } = await db.query(recentActivityQuery, [userId]);
        
        // Combine all data into a summary object
        const summary = {
            learning_paths: {
                total: parseInt(pathsRows[0].total_paths) || 0,
                completed: parseInt(pathsRows[0].completed_paths) || 0,
                in_progress: parseInt(pathsRows[0].in_progress_paths) || 0,
                avg_progress: Math.round(parseFloat(pathsRows[0].avg_progress) || 0)
            },
            skills: {
                total: parseInt(skillsRows[0].total_skills) || 0,
                completed: parseInt(skillsRows[0].completed_skills) || 0,
                mastered: parseInt(skillsRows[0].mastered_skills) || 0,
                in_progress: parseInt(skillsRows[0].in_progress_skills) || 0,
                total_points: parseInt(skillsRows[0].total_points) || 0
            },
            achievements: {
                total: parseInt(totalAchievementsRows[0].total_achievements) || 0,
                unlocked: parseInt(achievementsRows[0].unlocked_achievements) || 0,
                points: parseInt(achievementsRows[0].achievement_points) || 0,
                completion_percentage: Math.round(
                    (parseInt(achievementsRows[0].unlocked_achievements) || 0) / 
                    Math.max(1, parseInt(totalAchievementsRows[0].total_achievements) || 1) * 100
                )
            },
            subjects: subjectsRows,
            recent_activity: recentActivityRows
        };
        
        console.log(`[LearningPathService] Retrieved progress summary for user ${userId}`);
        res.status(200).json(summary);
    } catch (error) {
        console.error(`[LearningPathService] Error getting progress summary:`, error);
        res.status(500).json({ error: 'Failed to retrieve progress summary' });
    }
});

// --- Get User Progress by Subject ---
// GET /api/learning-paths/progress/subjects
router.get('/subjects', async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get subject progress for user ${userId}`);
    
    try {
        // Get subject progress with detailed stats
        const subjectsQuery = `
            SELECT 
                lp.subject,
                COUNT(DISTINCT ulp.learning_path_id) as total_paths,
                COUNT(DISTINCT CASE WHEN ulp.status = 'completed' THEN ulp.learning_path_id END) as completed_paths,
                COALESCE(AVG(ulp.progress_percentage), 0) as avg_path_progress,
                COUNT(DISTINCT s.id) as total_skills,
                COUNT(DISTINCT CASE WHEN us.status = 'completed' OR us.status = 'mastered' THEN us.skill_id END) as completed_skills,
                COALESCE(SUM(us.points_earned), 0) as total_points
            FROM learning_paths lp
            LEFT JOIN user_learning_paths ulp ON lp.id = ulp.learning_path_id AND ulp.user_id = $1
            LEFT JOIN skills s ON lp.id = s.learning_path_id
            LEFT JOIN user_skills us ON s.id = us.skill_id AND us.user_id = $1
            GROUP BY lp.subject
            ORDER BY avg_path_progress DESC
        `;
        
        const { rows } = await db.query(subjectsQuery, [userId]);
        
        // Calculate additional metrics for each subject
        const subjectsWithMetrics = rows.map(subject => {
            const totalSkills = parseInt(subject.total_skills) || 1; // Avoid division by zero
            const completedSkills = parseInt(subject.completed_skills) || 0;
            const skillCompletionPercentage = Math.round((completedSkills / totalSkills) * 100);
            
            return {
                ...subject,
                avg_path_progress: Math.round(parseFloat(subject.avg_path_progress) || 0),
                skill_completion_percentage: skillCompletionPercentage,
                total_paths: parseInt(subject.total_paths) || 0,
                completed_paths: parseInt(subject.completed_paths) || 0,
                total_skills: parseInt(subject.total_skills) || 0,
                completed_skills: parseInt(subject.completed_skills) || 0,
                total_points: parseInt(subject.total_points) || 0
            };
        });
        
        console.log(`[LearningPathService] Retrieved subject progress for user ${userId}`);
        res.status(200).json(subjectsWithMetrics);
    } catch (error) {
        console.error(`[LearningPathService] Error getting subject progress:`, error);
        res.status(500).json({ error: 'Failed to retrieve subject progress' });
    }
});

// --- Get User Activity Timeline ---
// GET /api/learning-paths/progress/timeline
router.get('/timeline', async (req, res) => {
    const userId = req.user.userId;
    const { limit = 20, offset = 0 } = req.query;
    
    console.log(`[LearningPathService] Received request to get activity timeline for user ${userId}`);
    
    try {
        // Get activity timeline with all types of activities
        const timelineQuery = `
            (SELECT 
                'learning_path_started' as activity_type,
                lp.id as item_id,
                lp.title as item_title,
                NULL as parent_id,
                NULL as parent_title,
                ulp.started_at as activity_date,
                0 as points_earned,
                lp.subject
            FROM user_learning_paths ulp
            JOIN learning_paths lp ON ulp.learning_path_id = lp.id
            WHERE ulp.user_id = $1 AND ulp.started_at IS NOT NULL)
            
            UNION ALL
            
            (SELECT 
                'learning_path_completed' as activity_type,
                lp.id as item_id,
                lp.title as item_title,
                NULL as parent_id,
                NULL as parent_title,
                ulp.completed_at as activity_date,
                0 as points_earned,
                lp.subject
            FROM user_learning_paths ulp
            JOIN learning_paths lp ON ulp.learning_path_id = lp.id
            WHERE ulp.user_id = $1 AND ulp.completed_at IS NOT NULL)
            
            UNION ALL
            
            (SELECT 
                'skill_started' as activity_type,
                s.id as item_id,
                s.title as item_title,
                s.learning_path_id as parent_id,
                lp.title as parent_title,
                us.started_at as activity_date,
                0 as points_earned,
                lp.subject
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.id
            JOIN learning_paths lp ON s.learning_path_id = lp.id
            WHERE us.user_id = $1 AND us.started_at IS NOT NULL)
            
            UNION ALL
            
            (SELECT 
                'skill_completed' as activity_type,
                s.id as item_id,
                s.title as item_title,
                s.learning_path_id as parent_id,
                lp.title as parent_title,
                us.completed_at as activity_date,
                us.points_earned,
                lp.subject
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.id
            JOIN learning_paths lp ON s.learning_path_id = lp.id
            WHERE us.user_id = $1 AND us.completed_at IS NOT NULL)
            
            UNION ALL
            
            (SELECT 
                'achievement_unlocked' as activity_type,
                a.id as item_id,
                a.title as item_title,
                NULL as parent_id,
                NULL as parent_title,
                ua.unlocked_at as activity_date,
                ua.points_earned,
                a.achievement_type as subject
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = $1)
            
            ORDER BY activity_date DESC
            LIMIT $2 OFFSET $3
        `;
        
        const { rows } = await db.query(timelineQuery, [userId, limit, offset]);
        
        console.log(`[LearningPathService] Retrieved activity timeline for user ${userId}`);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`[LearningPathService] Error getting activity timeline:`, error);
        res.status(500).json({ error: 'Failed to retrieve activity timeline' });
    }
});

// --- Get User Points History ---
// GET /api/learning-paths/progress/points
router.get('/points', async (req, res) => {
    const userId = req.user.userId;
    
    console.log(`[LearningPathService] Received request to get points history for user ${userId}`);
    
    try {
        // Get points from skills
        const skillPointsQuery = `
            SELECT 
                us.skill_id as item_id,
                s.title as item_title,
                'skill' as source_type,
                us.points_earned as points,
                us.completed_at as earned_at
            FROM user_skills us
            JOIN skills s ON us.skill_id = s.id
            WHERE us.user_id = $1 AND us.points_earned > 0 AND us.completed_at IS NOT NULL
        `;
        
        const { rows: skillPointsRows } = await db.query(skillPointsQuery, [userId]);
        
        // Get points from achievements
        const achievementPointsQuery = `
            SELECT 
                ua.achievement_id as item_id,
                a.title as item_title,
                'achievement' as source_type,
                ua.points_earned as points,
                ua.unlocked_at as earned_at
            FROM user_achievements ua
            JOIN achievements a ON ua.achievement_id = a.id
            WHERE ua.user_id = $1 AND ua.points_earned > 0
        `;
        
        const { rows: achievementPointsRows } = await db.query(achievementPointsQuery, [userId]);
        
        // Combine and sort by date
        const allPoints = [...skillPointsRows, ...achievementPointsRows]
            .sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
        
        // Calculate total points
        const totalPoints = allPoints.reduce((sum, item) => sum + parseInt(item.points), 0);
        
        // Group points by month for chart data
        const monthlyPoints = {};
        allPoints.forEach(item => {
            const date = new Date(item.earned_at);
            const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyPoints[monthYear]) {
                monthlyPoints[monthYear] = 0;
            }
            
            monthlyPoints[monthYear] += parseInt(item.points);
        });
        
        // Convert to array for chart data
        const chartData = Object.entries(monthlyPoints).map(([month, points]) => ({
            month,
            points
        })).sort((a, b) => a.month.localeCompare(b.month));
        
        console.log(`[LearningPathService] Retrieved points history for user ${userId}`);
        res.status(200).json({
            total_points: totalPoints,
            points_history: allPoints,
            chart_data: chartData
        });
    } catch (error) {
        console.error(`[LearningPathService] Error getting points history:`, error);
        res.status(500).json({ error: 'Failed to retrieve points history' });
    }
});

module.exports = router;
