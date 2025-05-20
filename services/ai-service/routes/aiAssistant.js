// services/ai-service/routes/aiAssistant.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const usageLimitService = require('../services/usageLimitService');
const logger = require('../utils/logger');

// --- AI Assistant Ask Endpoint ---
// POST /api/ai/ask
router.post('/', async (req, res) => {
  // TEMPORARY: Use mock user if req.user is undefined
  const user = req.user || {
    userId: "mock-user-123",
    role: "teacher"
  };
  
  const { prompt, includeThinking = false } = req.body;
  
  if (!prompt) {
    return res.status(400).json({ error: 'Missing required prompt parameter' });
  }
  
  // Check if Groq client is available
  if (!groq) {
    return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' });
  }
  
  logger.info(`AI Assistant request received from user ${user.userId}`);
  
  try {
    // Prepare system message
    const systemMessage = `You are LearnBridgeEdu AI, an educational assistant for teachers and students in Ghana.
    
Your primary goal is to provide accurate, helpful educational guidance based on the Ghanaian Standards-Based Curriculum (SBC).

When responding:
1. Be friendly, supportive, and encouraging
2. Focus on explaining concepts clearly at an appropriate level
3. Provide step-by-step explanations when appropriate
4. Suggest relevant learning resources and strategies
5. Encourage critical thinking rather than just giving answers
6. Use the Ghanaian educational context when relevant
7. If you're unsure about an answer, acknowledge your limitations

${includeThinking ? 'If you need to show your thinking process, wrap it in <think></think> tags. This will be shown to the user as a separate section.' : ''}`;

    // Generate the AI response using Groq
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ],
      model: 'llama3-70b-8192', // Or another appropriate model
      temperature: 0.7,
      max_tokens: 800,
      top_p: 0.9,
    });

    // Extract the response
    const aiResponse = chatCompletion.choices[0].message.content;
    
    // Process the response to extract thinking if needed
    let response = aiResponse;
    let thinking = null;
    
    if (includeThinking) {
      // Extract thinking process if it exists
      const thinkingMatch = aiResponse.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkingMatch) {
        thinking = thinkingMatch[1].trim();
        // Remove thinking tags from the main response
        response = aiResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      }
    }
    
    // Record usage for non-admin users
    if (user.role !== 'admin') {
      await usageLimitService.recordUsage(user, usageLimitService.SERVICES.AI_ASSISTANT);
    }
    
    // Get updated limit info
    const limitInfo = await usageLimitService.checkUserLimit(
      user,
      usageLimitService.SERVICES.AI_ASSISTANT
    );
    
    // Return the response
    res.status(200).json({
      response,
      ...(thinking && { thinking }),
      limitInfo
    });
  } catch (error) {
    logger.error('Error generating AI response:', error);
    res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

module.exports = router;
