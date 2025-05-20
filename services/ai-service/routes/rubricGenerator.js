// services/ai-service/routes/rubricGenerator.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- Rubric Generator ---
// POST /api/ai/generate/rubric
router.post('/', async (req, res) => {
  // TEMPORARY: Use mock user if req.user is undefined
  const user = req.user || {
    userId: "mock-user-123",
    role: "teacher"
  };
  
  const { 
    subject, 
    classLevel, 
    assignmentType, 
    criteria = [], 
    performanceLevels = ["Excellent", "Good", "Satisfactory", "Needs Improvement"],
    additionalNotes = "" 
  } = req.body;
  
  // Validate required fields
  if (!subject || !classLevel || !assignmentType) {
    return res.status(400).json({ 
      error: 'Missing required fields: subject, classLevel, and assignmentType are required' 
    });
  }
  
  // Check if Groq client is available
  if (!groq) {
    return res.status(503).json({ 
      error: 'AI Service Unavailable: Groq API key not configured.' 
    });
  }
  
  logger.info(`Rubric generation request received from user ${user.userId}`);
  
  try {
    // Prepare system message
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant for teachers in Ghana.
    
Your task is to create a comprehensive rubric following the Ghanaian Standards-Based Curriculum (SBC) format.

A rubric is an assessment tool that clearly defines performance expectations for an assignment.

The rubric should include:
1. Criteria for assessment listed vertically
2. Performance levels listed horizontally
3. Clear descriptions for each criterion at each performance level
4. Point values or score ranges for each performance level

Format the rubric in a clear, structured way that's easy for teachers to use and students to understand.`;

    // Prepare the prompt
    const prompt = `Please create a detailed rubric for a ${subject} ${assignmentType} at the ${classLevel} level.
    
${criteria.length > 0 
  ? `The rubric should include the following criteria:\n${criteria.map(c => `- ${c}`).join('\n')}`
  : `Please suggest appropriate criteria for this type of assignment.`}

The rubric should use these performance levels:
${performanceLevels.map(level => `- ${level}`).join('\n')}

${additionalNotes ? `Additional notes: ${additionalNotes}` : ''}

Please structure the rubric with:
1. A title and brief description of the assignment
2. A table format with criteria in rows and performance levels in columns
3. Clear descriptions for each criterion at each performance level
4. Point values or score ranges for each performance level
5. A total score calculation method
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
    const rubricContent = chatCompletion.choices[0].message.content;
    
    // Record usage for non-admin users
    if (user.role !== 'admin') {
      await usageLimitService.recordUsage(user, usageLimitService.SERVICES.GENERATE_RUBRIC);
    }
    
    // Get updated limit info
    const limitInfo = await usageLimitService.checkUserLimit(
      user,
      usageLimitService.SERVICES.GENERATE_RUBRIC
    );
    
    // Return the response
    res.status(200).json({
      rubricContent,
      metadata: {
        subject,
        classLevel,
        assignmentType,
        criteria: criteria.length > 0 ? criteria : ["Auto-generated criteria"],
        performanceLevels,
        generatedAt: new Date().toISOString()
      },
      limitInfo
    });
  } catch (error) {
    logger.error('Error generating rubric:', error);
    res.status(500).json({ error: 'Failed to generate rubric' });
  }
});

module.exports = router;
