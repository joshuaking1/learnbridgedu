import { Schema, model, Document } from 'mongoose';

export interface IParticipant {
  userId: string;
  name: string;
  role: 'teacher' | 'student';
  status: 'online' | 'offline';
  isSpeaking: boolean;
  isHandRaised: boolean;
}

export interface IBreakoutRoom {
  id: string;
  name: string;
  participants: string[];
  isActive: boolean;
}

export interface IResource {
  id: string;
  title: string;
  type: 'document' | 'video' | 'link';
  url: string;
  date: Date;
  size?: string;
}

export interface IMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: Date;
  isTeacher: boolean;
}

export interface IClassroom extends Document {
  name: string;
  description: string;
  teacherId: string;
  participants: IParticipant[];
  breakoutRooms: IBreakoutRoom[];
  resources: IResource[];
  messages: IMessage[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const classroomSchema = new Schema<IClassroom>({
  name: { type: String, required: true },
  description: { type: String, required: true },
  teacherId: { type: String, required: true },
  participants: [{
    userId: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['teacher', 'student'], required: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    isSpeaking: { type: Boolean, default: false },
    isHandRaised: { type: Boolean, default: false }
  }],
  breakoutRooms: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    participants: [{ type: String }],
    isActive: { type: Boolean, default: false }
  }],
  resources: [{
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['document', 'video', 'link'], required: true },
    url: { type: String, required: true },
    date: { type: Date, default: Date.now },
    size: { type: String }
  }],
  messages: [{
    id: { type: String, required: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isTeacher: { type: Boolean, default: false }
  }],
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

export const Classroom = model<IClassroom>('Classroom', classroomSchema); 