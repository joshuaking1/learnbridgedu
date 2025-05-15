import express from 'express';
import { classroomController } from '../controllers/classroomController';
import { authenticateToken } from '../middleware/authenticateToken';
import { authorizeRole } from '../middleware/authorizeRole';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Public routes (authenticated but no specific role required)
router.get('/:id', classroomController.getClassroom);
router.post('/:id/join', classroomController.joinClassroom);
router.post('/:id/leave', classroomController.leaveClassroom);
router.patch('/:id/participant-status', classroomController.updateParticipantStatus);
router.post('/:id/messages', classroomController.addMessage);

// Teacher-only routes
router.post('/', authorizeRole(['teacher', 'admin']), classroomController.createClassroom);
router.post('/:id/breakout-rooms', authorizeRole(['teacher', 'admin']), classroomController.createBreakoutRoom);
router.patch('/:id/breakout-rooms/:roomId/toggle', authorizeRole(['teacher', 'admin']), classroomController.toggleBreakoutRoom);
router.post('/:id/resources', authorizeRole(['teacher', 'admin']), classroomController.addResource);

export default router;