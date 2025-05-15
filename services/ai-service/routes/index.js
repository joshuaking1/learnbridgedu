// routes/index.js
const quizGeneratorRouter = require('./quizGenerator');
const usageLimitsRouter = require('./usageLimits');
const forumBotRouter = require('./forumBot');

// Function to register all routes with the app
function registerRoutes(app, authenticateToken, checkUsageLimit, usageLimitService) {
  // Existing routes
  app.use('/api/generate/quiz', authenticateToken, quizGeneratorRouter);
  app.use('/api/usage-limits', authenticateToken, usageLimitsRouter);
  
  // Forum integration routes
  app.use('/api/forum-bot', authenticateToken, forumBotRouter);
  
  // Add more route registrations here as needed
}

module.exports = registerRoutes;
