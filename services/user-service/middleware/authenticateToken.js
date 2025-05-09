// services/user-service/middleware/authenticateToken.js
require("dotenv").config();
const {
  clerkAuthMiddleware,
} = require("../../shared/middleware/clerkAuthMiddleware");
const logger = require("../utils/logger");

// Create an instance of the middleware with the user-service logger
const authenticateToken = clerkAuthMiddleware({ logger });

module.exports = authenticateToken;
