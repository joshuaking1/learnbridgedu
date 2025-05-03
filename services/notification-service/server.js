// Basic Express server setup for notification-service
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db'); // Import db connection

const app = express();
const PORT = process.env.NOTIFICATION_SERVICE_PORT || 3008; // Example port

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO setup
const http = require('http');
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000", // Allow frontend origin
    methods: ["GET", "POST"]
  }
});

// Placeholder: Store connected users (in a real app, use Redis or similar)
let connectedUsers = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Store user ID when they connect (requires authentication info)
  socket.on('registerUser', (userId) => {
    if (userId) {
      connectedUsers[userId] = socket.id;
      console.log(`User ${userId} registered with socket ID ${socket.id}`);
      // Optionally send unsent notifications upon registration
      // sendStoredNotifications(userId);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from connectedUsers
    for (const userId in connectedUsers) {
      if (connectedUsers[userId] === socket.id) {
        delete connectedUsers[userId];
        console.log(`User ${userId} unregistered`);
        break;
      }
    }
  });
});

// Function to send notification to a specific user
async function sendNotification(userId, notificationData) {
  if (!userId || !notificationData) {
    console.error('Invalid arguments passed to sendNotification');
    return;
  }

  // 1. Store notification in the database
  try {
    const insertQuery = `
      INSERT INTO notifications (user_id, type, title, message, related_entity_type, related_entity_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *; -- Return the created notification
    `;
    const values = [
      userId,
      notificationData.type || 'general',
      notificationData.title || 'New Notification',
      notificationData.message || '',
      notificationData.relatedEntityType, // Optional
      notificationData.relatedEntityId   // Optional
    ];
    const { rows } = await db.query(insertQuery, values);
    const savedNotification = rows[0];
    console.log(`Notification saved to DB with ID: ${savedNotification.id} for user ${userId}`);

    // 2. Attempt to send via Socket.IO if user is connected
    const socketId = connectedUsers[userId];
    if (socketId) {
      io.to(socketId).emit('newNotification', savedNotification); // Send the full saved notification object
      console.log(`Sent real-time notification to user ${userId} (Socket ID: ${socketId})`);
    } else {
      console.log(`User ${userId} not connected, notification stored in DB.`);
    }
  } catch (error) {
    console.error(`Error saving or sending notification for user ${userId}:`, error);
    // Decide if you want to throw the error or just log it
  }
}

// Make sendNotification available (e.g., via an internal API or message queue)
// For simplicity now, we might expose a simple endpoint or just keep it internal
app.locals.sendNotification = sendNotification; // Make accessible in routes if needed

// Routes
const notificationRoutes = require('./routes/notifications');
// Pass db connection to routes
app.use('/api/notifications', (req, res, next) => {
    req.db = db; // Make db available in request object for routes
    next();
}, notificationRoutes);

app.get('/', (req, res) => {
  res.send('Notification Service is running!');
});

// Error Handling Middleware (Example)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Use the http server for Socket.IO
server.listen(PORT, () => {
  console.log(`Notification Service (with Socket.IO) listening on port ${PORT}`);
});