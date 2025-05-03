import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import classroomRoutes from './routes/classroomRoutes';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/classrooms', classroomRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join classroom
  socket.on('join-classroom', (classroomId) => {
    socket.join(classroomId);
    console.log(`Client ${socket.id} joined classroom ${classroomId}`);
  });

  // Leave classroom
  socket.on('leave-classroom', (classroomId) => {
    socket.leave(classroomId);
    console.log(`Client ${socket.id} left classroom ${classroomId}`);
  });

  // Handle participant status updates
  socket.on('participant-status-update', (data) => {
    socket.to(data.classroomId).emit('participant-status-changed', {
      userId: data.userId,
      status: data.status,
      isSpeaking: data.isSpeaking,
      isHandRaised: data.isHandRaised
    });
  });

  // Handle chat messages
  socket.on('chat-message', (data) => {
    socket.to(data.classroomId).emit('new-message', {
      id: data.id,
      userId: data.userId,
      userName: data.userName,
      content: data.content,
      timestamp: data.timestamp,
      isTeacher: data.isTeacher
    });
  });

  // Handle breakout room updates
  socket.on('breakout-room-update', (data) => {
    socket.to(data.classroomId).emit('breakout-room-changed', {
      roomId: data.roomId,
      isActive: data.isActive,
      participants: data.participants
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/learnbridge')
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Start server
    const PORT = process.env.PORT || 5000;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection error:', error);
  }); 