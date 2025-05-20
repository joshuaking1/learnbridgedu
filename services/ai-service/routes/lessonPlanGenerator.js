// services/ai-service/routes/lessonPlanGenerator.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- Lesson Plan Generator ---
// POST /api/ai/generate/lesson-plan
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
    additionalNotes = "",
    strand = "",
    subStrand = "",
    week = ""
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
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant for teachers in Ghana.
    
Your task is to create a detailed lesson plan following the Ghanaian Standards-Based Curriculum (SBC) format.

The lesson plan should include:
1. Introduction/Starter (5-10 minutes)
2. Main Activity (30-40 minutes)
3. Plenary/Conclusion (5-10 minutes)
4. Assessment strategies
5. Resources needed
6. Differentiation strategies for different learner abilities

Format the lesson plan in a clear, structured way that's easy for teachers to follow.`;

    // Prepare the prompt
    const prompt = `Please create a detailed lesson plan for a ${subject} class at the ${classLevel} level on the topic "${topic}".
    
The lesson should be designed for a ${duration} class period.

${strand ? `Strand: ${strand}` : ''}
${subStrand ? `Sub-Strand: ${subStrand}` : ''}
${week ? `Week: ${week}` : ''}

${learningObjectives.length > 0 ? `Learning objectives:\n${learningObjectives.map(obj => `- ${obj}`).join('\n')}` : ''}

${additionalNotes ? `Additional notes: ${additionalNotes}` : ''}

Please structure the lesson plan with clear sections for Introduction/Starter, Main Activity, Plenary/Conclusion, Assessment, Resources, and Differentiation strategies.`;

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
        strand,
        subStrand,
        week,
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
