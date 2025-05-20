// services/ai-service/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { Pool } = require("pg");
const http = require("http");
const socketIo = require("socket.io");
const { Groq } = require("groq-sdk");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const logger = require("./utils/logger");

// --- Environment Variables ---
const PORT = process.env.PORT || 3003;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DB_CONNECTION_STRING = process.env.DATABASE_URL;

// --- Initialize Express App ---
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// --- Initialize Groq Client ---
let groq = null;
if (GROQ_API_KEY) {
  groq = new Groq({ apiKey: GROQ_API_KEY });
  logger.info("Groq client initialized.");
} else {
  logger.warn("WARNING: GROQ_API_KEY not set. AI generation will not work.");
}

// --- Initialize Database Connection ---
let db = null;
if (DB_CONNECTION_STRING) {
  db = new Pool({
    connectionString: DB_CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
  });
  logger.info("Database connection initialized.");
} else {
  logger.warn("WARNING: DATABASE_URL not set. Vector search will not work.");
}

// --- Authentication Middleware ---
// Import the Clerk authentication middleware
const authenticateToken = require("./middleware/authenticateToken");

// --- Usage Limit Service ---
const usageLimitService = {
  SERVICES: {
    GENERATE_QUIZ: "generate_quiz",
    GENERATE_LESSON_PLAN: "generate_lesson_plan",
    GENERATE_ASSESSMENT: "generate_assessment",
    GENERATE_TOS: "generate_tos",
    GENERATE_RUBRIC: "generate_rubric",
  },

  async checkUserLimit(user, service) {
    // Implementation details
    return {
      hasLimit: false,
      used: 0,
      limit: 100,
      remaining: 100,
    };
  },

  async recordUsage(user, service) {
    // Implementation details
    return true;
  },
};

// --- Usage Limit Middleware ---
function checkUsageLimit(service) {
  return async (req, res, next) => {
    // Skip limit check for admin users
    if (req.user.role === "admin") {
      return next();
    }

    try {
      const limitInfo = await usageLimitService.checkUserLimit(
        req.user,
        service
      );

      if (limitInfo.hasLimit && limitInfo.remaining <= 0) {
        return res.status(429).json({
          error: `Usage limit reached for ${service}. Please try again later.`,
          limitInfo,
        });
      }

      next();
    } catch (error) {
      console.error(`[AI Service] Error checking usage limit:`, error);
      // Allow the request to proceed even if limit check fails
      next();
    }
  };
}

// --- Existing HTTP Routes ---

// Health Check
app.get("/api/ai/health", (_, res) => {
  res.status(200).json({
    status: "AI Service is Up!",
    groqClientInitialized: !!groq,
    dbConnectionInitialized: !!db,
  });
});

// --- Import Routes ---
const quizGeneratorRouter = require("./routes/quizGenerator");
const usageLimitsRouter = require("./routes/usageLimits");
const forumBotRoutes = require("./routes/forumBot");
const aiAssistantRouter = require("./routes/aiAssistant");
const lessonPlannerRouter = require("./routes/lessonPlanner");
const lessonPlanGeneratorRouter = require("./routes/lessonPlanGenerator");
const assessmentCreatorRouter = require("./routes/assessmentCreator");
const tosBuilderRouter = require("./routes/tosBuilder");
const rubricGeneratorRouter = require("./routes/rubricGenerator");

// --- Make groq and db available to routes ---
app.locals.groq = groq;
app.locals.db = db;

// --- Mount Routes ---
// TEMPORARY: Bypassing authentication for all routes
app.use("/api/ai/generate/quiz", quizGeneratorRouter); // Authentication bypassed
app.use("/api/ai/limits", usageLimitsRouter); // Authentication bypassed
app.use("/api/forum-bot", forumBotRoutes); // No authentication required for forum bot routes
app.use("/api/ai/ask", aiAssistantRouter); // AI Assistant route

// Teacher tools routes
app.use("/api/ai/generate/lesson", lessonPlannerRouter); // Lesson planner route
app.use("/api/ai/generate/lesson-plan", lessonPlanGeneratorRouter); // Lesson plan generator route (for frontend compatibility)
app.use("/api/ai/generate/assessment", assessmentCreatorRouter); // Assessment creator route
app.use("/api/ai/generate/tos", tosBuilderRouter); // Table of Specifications builder route
app.use("/api/ai/generate/rubric", rubricGeneratorRouter); // Rubric generator route

// Add a mock user for routes that expect user data
app.use((req, res, next) => {
  // Add a mock user to all requests
  req.user = {
    userId: "mock-user-123",
    role: "teacher", // Set to teacher to ensure all features work
    email: "mock@example.com",
    firstName: "Mock",
    lastName: "User",
  };
  next();
});

// --- Start the HTTP server (which includes Socket.IO) ---
server.listen(PORT, () => {
  logger.info(`AI Service (HTTP + Socket.IO) running on port ${PORT}`);
  // Optional DB connection test
  if (db?.query) {
    db.query("SELECT NOW()")
      .then(() => logger.info("DB Connection Test Successful."))
      .catch((err) => logger.error("DB Connection Error on Startup:", err));
  }
});

// --- Helper function for generating embeddings ---
async function generateEmbedding() {
  try {
    // Implementation details
    return []; // Placeholder
  } catch (error) {
    console.error("[AI Service] Error generating embedding:", error);
    return null;
  }
}

// Export for testing
module.exports = { app, server };
