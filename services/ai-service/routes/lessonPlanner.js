// services/ai-service/routes/lessonPlanner.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- Lesson Plan Generator ---
// POST /api/ai/generate/lesson
router.post('/', async (req, res) => {
  // TEMPORARY: Use mock user if req.user is undefined
  const user = req.user || {
    userId: "mock-user-123",
    role: "teacher"
  };
  
  const { 
    subject, 
    classLevel, 
    topic, 
    duration = 60, 
    learningObjectives = [], 
    additionalNotes = "" 
  } = req.body;
  
  // Validate required fields
  if (!subject || !classLevel || !topic) {
    return res.status(400).json({ 
      error: 'Missing required fields: subject, classLevel, and topic are required' 
    });
  }
  
  // Check if Groq client is available
  if (!groq) {
    return res.status(503).json({ 
      error: 'AI Service Unavailable: Groq API key not configured.' 
    });
  }
  
  logger.info(`Lesson plan generation request received from user ${user.userId}`);
  
  try {
    // Prepare system message
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant designed to support teachers in Ghana.

Your role is to generate detailed, Standards-Based Curriculum (SBC) lesson plans for any subject and grade level taught in Ghanaian schools.

Each lesson plan must follow the SBC lesson planning structure and include:

Introduction/Starter (5–10 minutes) — a warm-up or engagement activity

Main Activity (30–40 minutes) — core teaching and learning activities

Plenary/Conclusion (5–10 minutes) — a recap, reflection or summary activity

Assessment — based on Depth of Knowledge (DoK) levels

Resources Needed — textbooks, TLMs, digital aids, etc.

Differentiation Strategies — to support learners of varying ability levels

Please present the lesson plan in a clear, well-structured format that is easy for teachers to read and implement.`;

    // Prepare the prompt
    const prompt = `Now, generate a lesson plan using the following input:

Subject: ${subject}
Class Level: ${classLevel}
Topic: "${topic}"
Duration: ${duration} minutes

${learningObjectives.length > 0 ? `Learning Objectives:\n${learningObjectives.map(obj => `- ${obj}`).join('\n')}` : ''}

${additionalNotes ? `Additional Notes: ${additionalNotes}` : ''}

Make sure the lesson plan promotes creativity, learner engagement, inquiry-based learning, and aligns with Ghana's national curriculum framework.`;

    // Generate the AI response using Groq
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 2000,
      top_p: 0.9,
    });

    // Extract the response
    const lessonPlan = chatCompletion.choices[0].message.content;
    
    // Record usage for non-admin users
    if (user.role !== 'admin') {
      await usageLimitService.recordUsage(user, usageLimitService.SERVICES.GENERATE_LESSON_PLAN);
    }
    
    // Get updated limit info
    const limitInfo = await usageLimitService.checkUserLimit(
      user,
      usageLimitService.SERVICES.GENERATE_LESSON_PLAN
    );
    
    // Return the response
    res.status(200).json({
      lessonPlan,
      metadata: {
        subject,
        classLevel,
        topic,
        duration,
        generatedAt: new Date().toISOString()
      },
      limitInfo
    });
  } catch (error) {
    logger.error('Error generating lesson plan:', error);
    res.status(500).json({ error: 'Failed to generate lesson plan' });
  }
});

module.exports = router;
