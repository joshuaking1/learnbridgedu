// services/quiz-service/scheduler.js
require('dotenv').config();
const cron = require('node-cron');
const dailyQuizGenerator = require('./services/dailyQuizGenerator');

// Schedule daily quiz generation at 1:00 AM every day
// Cron format: minute hour day-of-month month day-of-week
cron.schedule('0 1 * * *', async () => {
    console.log('[QuizScheduler] Starting scheduled daily quiz generation...');
    
    try {
        const results = await dailyQuizGenerator.generateDailyQuizzes();
        console.log(`[QuizScheduler] Daily quiz generation completed. Generated ${results.filter(r => r.status === 'success').length} quizzes.`);
    } catch (error) {
        console.error('[QuizScheduler] Error during scheduled quiz generation:', error);
    }
});

// Also provide a function to manually trigger quiz generation
async function triggerDailyQuizGeneration() {
    console.log('[QuizScheduler] Manually triggering daily quiz generation...');
    
    try {
        const results = await dailyQuizGenerator.generateDailyQuizzes();
        console.log(`[QuizScheduler] Manual quiz generation completed. Generated ${results.filter(r => r.status === 'success').length} quizzes.`);
        return results;
    } catch (error) {
        console.error('[QuizScheduler] Error during manual quiz generation:', error);
        throw error;
    }
}

// Export the trigger function for manual execution
module.exports = {
    triggerDailyQuizGeneration
};
