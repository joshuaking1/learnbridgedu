// services/content-service/middleware/authenticateToken.js
import { clerkAuthMiddleware } from "../../shared/middleware/clerkAuthMiddleware.js.mjs";
import logger from "../utils/logger";

// Create an instance of the middleware with the content-service logger
const authenticateToken = clerkAuthMiddleware({ logger });

export default authenticateToken;
