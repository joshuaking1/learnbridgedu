import { Request, Response } from 'express';
import { Classroom, IClassroom, IBreakoutRoom, IMessage, IResource } from '../models/Classroom';
import { v4 as uuidv4 } from 'uuid';

export const classroomController = {
  // Create a new classroom
  async createClassroom(req: Request, res: Response) {
    try {
      const { name, description, teacherId } = req.body;
      const classroom = new Classroom({
        name,
        description,
        teacherId,
        participants: [{
          userId: teacherId,
          name: req.body.teacherName,
          role: 'teacher',
          status: 'online'
        }]
      });
      await classroom.save();
      res.status(201).json(classroom);
    } catch (error) {
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
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const newMessage: IMessage = {
        id: uuidv4(),
        userId,
        userName,
        content,
        timestamp: new Date(),
        isTeacher
      };

      classroom.messages.push(newMessage);
      await classroom.save();
      res.json(classroom);
    } catch (error) {
      res.status(500).json({ error: 'Failed to add message' });
    }
  },

  // Add resource
  async addResource(req: Request, res: Response) {
    try {
      const { title, type, url, size } = req.body;
      const classroom = await Classroom.findById(req.params.id);
      
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found' });
      }

      const newResource: IResource = {
        id: uuidv4(),
        title,
        type,
        url,
        date: new Date(),
        size
      };

      classroom.resources.push(newResource);
      await classroom.save();
      res.json(classroom);
    } catch (error) {
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