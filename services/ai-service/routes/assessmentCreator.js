// services/ai-service/routes/assessmentCreator.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- Assessment Generator ---
// POST /api/ai/generate/assessment
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
    assessmentType = "formative", 
    numQuestions = 5,
    dokLevels = ["recall", "skill", "strategic thinking", "extended thinking"],
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
  
  logger.info(`Assessment generation request received from user ${user.userId}`);
  
  try {
    // Prepare system message
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant for teachers in Ghana.
    
Your task is to create a comprehensive assessment following the Ghanaian Standards-Based Curriculum (SBC) format.

The assessment should include:
1. Clear instructions for students
2. A variety of question types appropriate for the subject and topic
3. Questions that assess different levels of thinking based on Depth of Knowledge (DOK) levels
4. A marking scheme or rubric for scoring

Format the assessment in a clear, structured way that's easy for teachers to use and students to understand.`;

    // Prepare the prompt
    const prompt = `Please create a ${assessmentType} assessment for a ${subject} class at the ${classLevel} level on the topic "${topic}".
    
The assessment should include ${numQuestions} questions covering the following Depth of Knowledge (DOK) levels:
${dokLevels.map(level => `- ${level}`).join('\n')}

${additionalNotes ? `Additional notes: ${additionalNotes}` : ''}

Please structure the assessment with:
1. Clear instructions for students
2. Numbered questions with appropriate point values
3. A variety of question types (multiple choice, short answer, extended response, etc.)
4. A marking scheme or answer key
`;

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
    const assessment = chatCompletion.choices[0].message.content;
    
    // Record usage for non-admin users
    if (user.role !== 'admin') {
      await usageLimitService.recordUsage(user, usageLimitService.SERVICES.GENERATE_ASSESSMENT);
    }
    
    // Get updated limit info
    const limitInfo = await usageLimitService.checkUserLimit(
      user,
      usageLimitService.SERVICES.GENERATE_ASSESSMENT
    );
    
    // Return the response
    res.status(200).json({
      assessment,
      metadata: {
        subject,
        classLevel,
        topic,
        assessmentType,
        numQuestions,
        dokLevels,
        generatedAt: new Date().toISOString()
      },
      limitInfo
    });
  } catch (error) {
    logger.error('Error generating assessment:', error);
    res.status(500).json({ error: 'Failed to generate assessment' });
  }
});

module.exports = router;
