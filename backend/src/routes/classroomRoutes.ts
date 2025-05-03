import express from 'express';
import { classroomController } from '../controllers/classroomController';

const router = express.Router();

// Classroom management
router.post('/', classroomController.createClassroom);
router.get('/:id', classroomController.getClassroom);

// Participant management
router.post('/:id/join', classroomController.joinClassroom);
router.post('/:id/leave', classroomController.leaveClassroom);
router.patch('/:id/participant-status', classroomController.updateParticipantStatus);

// Breakout rooms
router.post('/:id/breakout-rooms', classroomController.createBreakoutRoom);
router.patch('/:id/breakout-rooms/:roomId/toggle', classroomController.toggleBreakoutRoom);

// Messages
router.post('/:id/messages', classroomController.addMessage);

// Resources
router.post('/:id/resources', classroomController.addResource);

export default router; 