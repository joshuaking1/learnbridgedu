// services/ai-service/routes/tosBuilder.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- Table of Specifications (TOS) Generator ---
// POST /api/ai/generate/tos
router.post('/', async (req, res) => {
  // TEMPORARY: Use mock user if req.user is undefined
  const user = req.user || {
    userId: "mock-user-123",
    role: "teacher"
  };
  
  const { 
    subject, 
    classLevel, 
    topics = [], 
    contentWeights = {},
    dokLevels = ["recall", "skill", "strategic thinking", "extended thinking"],
    totalItems = 50,
    additionalNotes = "" 
  } = req.body;
  
  // Validate required fields
  if (!subject || !classLevel || topics.length === 0) {
    return res.status(400).json({ 
      error: 'Missing required fields: subject, classLevel, and at least one topic are required' 
    });
  }
  
  // Check if Groq client is available
  if (!groq) {
    return res.status(503).json({ 
      error: 'AI Service Unavailable: Groq API key not configured.' 
    });
  }
  
  logger.info(`TOS generation request received from user ${user.userId}`);
  
  try {
    // Prepare system message
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant for teachers in Ghana.
    
Your task is to create a Table of Specifications (TOS) following the Ghanaian Standards-Based Curriculum (SBC) format.

A Table of Specifications (TOS) is a tool that helps teachers align assessment items with learning objectives and cognitive levels.

The TOS should include:
1. Content areas/topics listed vertically
2. Cognitive levels (Depth of Knowledge) listed horizontally
3. Number of items for each cell in the table
4. Percentage weights for both content areas and cognitive levels
5. Row and column totals

Format the TOS in a clear, structured way that's easy for teachers to use.`;

    // Prepare the prompt
    const prompt = `Please create a Table of Specifications (TOS) for a ${subject} assessment at the ${classLevel} level.
    
The assessment will cover the following topics:
${topics.map((topic, index) => {
  const weight = contentWeights[topic] || Math.round(100 / topics.length);
  return `${index + 1}. ${topic} (${weight}%)`;
}).join('\n')}

The assessment will include items at these Depth of Knowledge (DOK) levels:
${dokLevels.map(level => `- ${level}`).join('\n')}

The assessment will have a total of ${totalItems} items.

${additionalNotes ? `Additional notes: ${additionalNotes}` : ''}

Please create a complete TOS with:
1. A table showing the distribution of items across topics and DOK levels
2. The number of items for each cell in the table
3. Row and column totals
4. Percentage weights for both topics and DOK levels
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
    const tosContent = chatCompletion.choices[0].message.content;
    
    // Record usage for non-admin users
    if (user.role !== 'admin') {
      await usageLimitService.recordUsage(user, usageLimitService.SERVICES.GENERATE_TOS);
    }
    
    // Get updated limit info
    const limitInfo = await usageLimitService.checkUserLimit(
      user,
      usageLimitService.SERVICES.GENERATE_TOS
    );
    
    // Return the response
    res.status(200).json({
      tosContent,
      metadata: {
        subject,
        classLevel,
        topics,
        dokLevels,
        totalItems,
        generatedAt: new Date().toISOString()
      },
      limitInfo
    });
  } catch (error) {
    logger.error('Error generating TOS:', error);
    res.status(500).json({ error: 'Failed to generate Table of Specifications' });
  }
});

module.exports = router;
