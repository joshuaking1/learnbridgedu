// Basic Express server setup for discussion-service
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const http = require("http");
const socketIo = require("socket.io");
const clerk = require("@clerk/clerk-sdk-node");

// Initialize Express
const app = express();
const PORT = process.env.DISCUSSION_SERVICE_PORT || 3007;

// Setup server for WebSockets
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Test database connection
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("Database connection error:", err.stack);
  } else {
    console.log("Database connected successfully at:", res.rows[0].now);
  }
});

// Export the database pool for use in route handlers
app.locals.db = pool;

// Middleware
app.use(cors());
app.use(express.json());

// Clerk authentication middleware
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the token using Clerk
    clerk
      .verifyToken(token)
      .then((decoded) => {
        req.user = decoded;
        next();
      })
      .catch((err) => {
        console.error("Token verification error:", err);
        res.status(401).json({ error: "Unauthorized - Invalid token" });
      });
  } catch (error) {
    console.error("Auth error:", error);
    res
      .status(500)
      .json({ error: "Internal server error during authentication" });
  }
};

// Routes
const forumRoutes = require("./routes/forums");
const threadRoutes = require("./routes/threads");
const postRoutes = require("./routes/posts");
const botRoutes = require("./routes/bot");
const userRoutes = require("./routes/users");
const webhookRoutes = require("./routes/webhooks");

app.use("/api/forums", forumRoutes);
app.use("/api/threads", threadRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/bot", botRoutes);
app.use("/api/users", userRoutes);
app.use("/api/webhooks", webhookRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.send("Discussion Service is running!");
});

// WebSocket connection for real-time updates
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Join room for specific forum
  socket.on("joinForum", (forumId) => {
    socket.join(`forum:${forumId}`);
    console.log(`Socket ${socket.id} joined forum:${forumId}`);
  });

  // Join room for specific thread
  socket.on("joinThread", (threadId) => {
    socket.join(`thread:${threadId}`);
    console.log(`Socket ${socket.id} joined thread:${threadId}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Global error handler:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Discussion Service listening on port ${PORT}`);
});
