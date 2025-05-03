// Basic Express server setup for discussion-service
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.DISCUSSION_SERVICE_PORT || 3007; // Example port

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const forumRoutes = require('./routes/forums');
const threadRoutes = require('./routes/threads');
const postRoutes = require('./routes/posts');

app.use('/api/forums', forumRoutes);
// Assuming threads are nested under forums: /api/forums/:forumId/threads
app.use('/api/forums/:forumId/threads', threadRoutes);
// Assuming posts are nested under threads: /api/forums/:forumId/threads/:threadId/posts
app.use('/api/forums/:forumId/threads/:threadId/posts', postRoutes);

app.get('/', (req, res) => {
  res.send('Discussion Service is running!');
});

// Error Handling Middleware (Example)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Discussion Service listening on port ${PORT}`);
});