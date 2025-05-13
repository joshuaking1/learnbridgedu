import { Request, Response } from 'express';
import { Classroom, IClassroom, IBreakoutRoom, IMessage, IResource } from '../models/Classroom';
import { v4 as uuidv4 } from 'uuid';

export const classroomController = {
  // Create a new classroom
  async createClassroom(req: Request, res: Response) {
    try {
      const { name, description, teacherId, teacherName } = req.body;
      
      // Input validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Classroom name is required' });
      }
      
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: 'Classroom description is required' });
      }
      
      if (!teacherId || typeof teacherId !== 'string' || teacherId.trim().length === 0) {
        return res.status(400).json({ error: 'Teacher ID is required' });
      }
      
      if (!teacherName || typeof teacherName !== 'string' || teacherName.trim().length === 0) {
        return res.status(400).json({ error: 'Teacher name is required' });
      }
      
      // Ensure the teacher ID matches the authenticated user or user is admin
      if (req.user.userId !== teacherId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only create classrooms as yourself' });
      }
      
      // Create classroom with sanitized inputs
      const classroom = new Classroom({
        name: name.trim(),
        description: description.trim(),
        teacherId,
        participants: [{
          userId: teacherId,
          name: teacherName.trim(),
          role: 'teacher',
          status: 'online'
        }]
      });
      
      await classroom.save();
      res.status(201).json(classroom);
    } catch (error) {
      console.error('Error creating classroom:', error);
      res.status(500).json({ error: 'Failed to create classroom' });
    }
  },

  // Get classroom by ID
  async getClassroom(req: Request, res: Response) {
    try {
      const classroom = await Classroom.findById(req.params.id);
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }
      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get classroom' });
    }
  },

  // Join classroom
  async joinClassroom(req: Request, res: Response) {
    try {
      const { userId, userName, role } = req.body;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const existingParticipant = classroom.participants.find(p => p.userId === userId);
      if (existingParticipant) {
        existingParticipant.status = 'online';
      } else {
        classroom.participants.push({
          userId,
          name: userName,
          role,
          status: 'online',
          isSpeaking: false,
          isHandRaised: false
        });
      }

      await classroom.save();
      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to join classroom' });
    }
  },

  // Leave classroom
  async leaveClassroom(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const participant = classroom.participants.find(p => p.userId === userId);
      if (participant) {
        participant.status = 'offline';
        await classroom.save();
      }

      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to leave classroom' });
    }
  },

  // Create breakout room
  async createBreakoutRoom(req: Request, res: Response) {
    try {
      const { name } = req.body;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const newRoom: IBreakoutRoom = {
        id: uuidv4(),
        name,
        participants: [],
        isActive: false
      };

      classroom.breakoutRooms.push(newRoom);
      await classroom.save();
      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create breakout room' });
    }
  },

  // Toggle breakout room
  async toggleBreakoutRoom(req: Request, res: Response) {
    try {
      const { roomId } = req.params;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const room = classroom.breakoutRooms.find(r => r.id === roomId);
      if (room) {
        room.isActive = !room.isActive;
        await classroom.save();
      }

      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to toggle breakout room' });
    }
  },

  // Add message
  async addMessage(req: Request, res: Response) {
    try {
      const { userId, userName, content, isTeacher } = req.body;
      
      // Input validation
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      if (!userName || typeof userName !== 'string' || userName.trim().length === 0) {
        return res.status(400).json({ error: 'User name is required' });
      }
      
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Message content is required' });
      }
      
      // Ensure the user ID matches the authenticated user
      if (req.user.userId !== userId) {
        return res.status(403).json({ error: 'You can only send messages as yourself' });
      }
      
      // Determine if user is a teacher based on their role
      const actualIsTeacher = req.user.role === 'teacher' || req.user.role === 'admin';
      
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }
      
      // Verify user is a participant in this classroom
      const isParticipant = classroom.participants.some(p => p.userId === userId);
      if (!isParticipant && classroom.teacherId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'You are not a participant in this classroom' });
      }

      // Sanitize content to prevent XSS
      const sanitizedContent = content
        .trim()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      const newMessage: IMessage = {
        id: uuidv4(),
        userId,
        userName: userName.trim(),
        content: sanitizedContent,
        timestamp: new Date(),
        isTeacher: actualIsTeacher // Use the role from authentication
      };

      classroom.messages.push(newMessage);
      await classroom.save();
      res.json(classroom);
    } catch (error) {
      console.error('Error adding message:', error);
      res.status(500).json({ error: 'Failed to add message' });
    }
  },

  // Add resource
  async addResource(req: Request, res: Response) {
    try {
      const { title, type, url, size } = req.body;
      
      // Input validation
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Resource title is required' });
      }
      
      if (!type || typeof type !== 'string' || !['document', 'video', 'link'].includes(type)) {
        return res.status(400).json({ error: 'Valid resource type is required (document, video, or link)' });
      }
      
      if (!url || typeof url !== 'string' || url.trim().length === 0) {
        return res.status(400).json({ error: 'Resource URL is required' });
      }
      
      // Validate URL format
      try {
        new URL(url); // This will throw if URL is invalid
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
      
      // Validate size if provided
      if (size !== undefined && (typeof size !== 'string' || size.trim().length === 0)) {
        return res.status(400).json({ error: 'Resource size must be a string if provided' });
      }
      
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }
      
      // Verify user is the teacher of this classroom or an admin
      if (classroom.teacherId !== req.user.userId && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the teacher or admin can add resources to this classroom' });
      }

      const newResource: IResource = {
        id: uuidv4(),
        title: title.trim(),
        type,
        url: url.trim(),
        date: new Date(),
        size: size ? size.trim() : undefined
      };

      classroom.resources.push(newResource);
      await classroom.save();
      res.json(classroom);
    } catch (error) {
      console.error('Error adding resource:', error);
      res.status(500).json({ error: 'Failed to add resource' });
    }
  },

  // Update participant status
  async updateParticipantStatus(req: Request, res: Response) {
    try {
      const { userId, status, isSpeaking, isHandRaised } = req.body;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const participant = classroom.participants.find(p => p.userId === userId);
      if (participant) {
        if (status) participant.status = status;
        if (typeof isSpeaking === 'boolean') participant.isSpeaking = isSpeaking;
        if (typeof isHandRaised === 'boolean') participant.isHandRaised = isHandRaised;
        await classroom.save();
      }

      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update participant status' });
    }
  }
}; 