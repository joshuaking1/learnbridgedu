import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
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
const allowedOrigins = [
  'http://localhost:3000',
  'https://app.learnbridgedu.com',
  'https://learnbridgedu.com'
];

// Only add FRONTEND_URL if it's defined and valid
if (process.env.FRONTEND_URL && 
    (process.env.FRONTEND_URL.startsWith('http://') || 
     process.env.FRONTEND_URL.startsWith('https://'))) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Add security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(express.json({ limit: '1mb' })); // Limit request body size

// Routes
app.use('/api/classrooms', classroomRoutes);

// Socket.IO middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  
  try {
    const jwtSecret = process.env.JWT_SECRET;
    
    if (!jwtSecret) {
      console.error('JWT_SECRET is not defined in environment variables');
      return next(new Error('Server configuration error'));
    }
    
    // Verify the token
    const user = jwt.verify(token, jwtSecret);
    
    // Attach user data to socket
    socket.data.user = user;
    next();
  } catch (err: any) {
    console.warn('Socket authentication error:', err.message);
    return next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const user = socket.data.user;
  console.log(`Client connected: ${socket.id}, User: ${user.userId}, Role: ${user.role}`);

  // Join classroom - validate user has access to this classroom
  socket.on('join-classroom', async (classroomId) => {
    try {
      // Verify the classroom exists and user has access
      const classroom = await mongoose.model('Classroom').findById(classroomId);
      
      if (!classroom) {
        socket.emit('error', { message: 'Classroom not found' });
        return;
      }
      
      // Check if user is a participant or teacher
      const isParticipant = classroom.participants.some(p => p.userId === user.userId);
      const isTeacher = classroom.teacherId === user.userId;
      
      if (!isParticipant && !isTeacher && user.role !== 'admin') {
        socket.emit('error', { message: 'Access denied to this classroom' });
        return;
      }
      
      socket.join(classroomId);
      console.log(`Client ${socket.id} (User: ${user.userId}) joined classroom ${classroomId}`);
      
      // Notify others that user joined
      socket.to(classroomId).emit('user-joined', {
        userId: user.userId,
        name: user.name || 'Unknown User',
        role: user.role
      });
    } catch (error) {
      console.error('Error joining classroom:', error);
      socket.emit('error', { message: 'Failed to join classroom' });
    }
  });

  // Leave classroom
  socket.on('leave-classroom', (classroomId) => {
    socket.leave(classroomId);
    console.log(`Client ${socket.id} (User: ${user.userId}) left classroom ${classroomId}`);
    
    // Notify others that user left
    socket.to(classroomId).emit('user-left', {
      userId: user.userId
    });
  });

  // Handle participant status updates - validate user is updating their own status
  socket.on('participant-status-update', (data) => {
    // Ensure users can only update their own status unless they're a teacher
    if (data.userId !== user.userId && user.role !== 'teacher' && user.role !== 'admin') {
      socket.emit('error', { message: 'You can only update your own status' });
      return;
    }
    
    socket.to(data.classroomId).emit('participant-status-changed', {
      userId: data.userId,
      status: data.status,
      isSpeaking: data.isSpeaking,
      isHandRaised: data.isHandRaised
    });
  });

  // Handle chat messages - sanitize content
  socket.on('chat-message', (data) => {
    // Ensure the user is sending messages as themselves
    if (data.userId !== user.userId) {
      socket.emit('error', { message: 'You can only send messages as yourself' });
      return;
    }
    
    // Basic content sanitization (remove HTML tags)
    const sanitizedContent = data.content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    socket.to(data.classroomId).emit('new-message', {
      id: data.id,
      userId: data.userId,
      userName: data.userName,
      content: sanitizedContent,
      timestamp: data.timestamp,
      isTeacher: user.role === 'teacher' || user.role === 'admin'
    });
  });

  // Handle breakout room updates - only teachers can manage breakout rooms
  socket.on('breakout-room-update', (data) => {
    // Only teachers and admins can manage breakout rooms
    if (user.role !== 'teacher' && user.role !== 'admin') {
      socket.emit('error', { message: 'Only teachers can manage breakout rooms' });
      return;
    }
    
    socket.to(data.classroomId).emit('breakout-room-changed', {
      roomId: data.roomId,
      isActive: data.isActive,
      participants: data.participants
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}, User: ${user.userId}`);
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