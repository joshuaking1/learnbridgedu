// services/learning-path-service/middleware/authenticateToken.js
const {
  clerkAuthMiddleware,
} = require("../../shared/middleware/clerkAuthMiddleware");
const logger = require("../utils/logger");

// Create an instance of the middleware with the learning-path-service logger
const authenticateToken = clerkAuthMiddleware({ logger });

module.exports = authenticateToken;
