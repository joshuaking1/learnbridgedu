// routes/forumBot.js
const express = require('express');
const router = express.Router();
const groq = require('../groqClient');
const { generateEmbedding } = require('../utils/embeddingProcessor');
const db = require('../db');
const authenticateToken = require('../middleware/authenticateToken');
const checkUsageLimit = require('../middleware/checkUsageLimit');
const usageLimitService = require('../services/usageLimitService');

// Process a forum post and generate a bot response
router.post('/forum-post', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.AI_ASSISTANT), async (req, res) => {
    if (!groq) {
        return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' });
    }
    
    try {
        const { postId } = req.body;
        
        if (!postId) {
            return res.status(400).json({ error: 'Missing required postId parameter' });
        }
        
        // Fetch the post data from the discussion service
        const discussionServiceUrl = process.env.DISCUSSION_SERVICE_URL || 'http://localhost:3007';
        const fetch = require('node-fetch');
        
        const postResponse = await fetch(`${discussionServiceUrl}/api/posts/${postId}`, {
            headers: {
                'Authorization': req.headers.authorization
            }
        });
        
        if (!postResponse.ok) {
            return res.status(404).json({ error: 'Post not found or could not be retrieved' });
        }
        
        const post = await postResponse.json();
        
        // Get thread data for context
        const threadResponse = await fetch(`${discussionServiceUrl}/api/threads/${post.thread_id}`, {
            headers: {
                'Authorization': req.headers.authorization
            }
        });
        
        if (!threadResponse.ok) {
            return res.status(404).json({ error: 'Thread not found or could not be retrieved' });
        }
        
        const thread = await threadResponse.json();
        
        // Generate embedding for the post content to find relevant educational material
        const promptEmbedding = await generateEmbedding(post.content);
        
        // Variable to track if we found SBC context
        let sbcResultsFound = false;
        let sbcContextText = '';
        
        // Perform vector search if embedding was generated successfully
        if (promptEmbedding && promptEmbedding.length === 384 && db) {
            // Query for similar content in the SBC documents
            const vectorSearchQuery = {
                text: 'SELECT chunk_id, book, subject, class_level, strand, sub_strand, chunk_text, metadata, ' +
                      'embedding <=> $1 as distance ' +
                      'FROM sbc_chunks ' +
                      'ORDER BY distance ASC ' +
                      'LIMIT 5',
                values: [promptEmbedding]
            };
            
            try {
                const sbcResults = await db.query(vectorSearchQuery);
                
                if (sbcResults.rows && sbcResults.rows.length > 0) {
                    sbcResultsFound = true;
                    
                    // Prepare SBC context from the results
                    sbcContextText = sbcResults.rows.map(row => {
                        return `[SBC Content - ${row.subject} ${row.class_level} - ${row.strand}${row.sub_strand ? ' / ' + row.sub_strand : ''}]\n${row.chunk_text}`;
                    }).join('\n\n');
                }
            } catch (dbError) {
                console.error('Error performing vector search:', dbError);
                // Continue without SBC context if error occurs
            }
        }
        
        // Craft the system message for the AI
        const systemContent = `You are LearnBridgeEdu Bot, an educational assistant in the LearnBridge forum platform. You help students and teachers with their educational questions and discussions.

Your primary goal is to provide accurate, helpful educational guidance. You should always:
- Be friendly, supportive, and encouraging to learners
- Focus on explaining concepts clearly and at an appropriate level for the student
- Provide step-by-step explanations when appropriate
- Suggest relevant learning resources and strategies
- Encourage critical thinking rather than just giving answers
- Use the Ghanaian Standards-Based Curriculum (SBC) as a reference when available

${sbcResultsFound ? 'SBC CONTEXT INFORMATION:\n' + sbcContextText : 'No specific SBC context is available for this query. Provide general educational guidance based on your knowledge.'}

Current Forum Context:
- Thread Title: ${thread.title}
- Thread Tags: ${thread.tags ? thread.tags.join(', ') : 'No tags'}

When responding in the forum:
1. Address the specific educational question or topic
2. If the post contains multiple questions, address each one systematically
3. If appropriate, suggest related topics the student might want to explore
4. If you're unsure about an answer, acknowledge your limitations rather than providing potentially incorrect information
5. Always maintain a supportive and educational tone
6. Sign your response as "- LearnBridgeEdu Bot"`;

        // Generate the AI response using Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: post.content }
            ],
            model: 'llama3-70b-8192', // Or another appropriate model
            temperature: 0.5,
            max_tokens: 800,
            top_p: 0.9,
        });

        // Extract the bot's response
        const botResponse = chatCompletion.choices[0].message.content;
        
        // Return the generated response
        res.json({
            post_id: postId,
            thread_id: post.thread_id,
            response: botResponse,
            used_sbc_context: sbcResultsFound
        });
        
    } catch (error) {
        console.error('Error generating forum bot response:', error);
        res.status(500).json({ error: 'Failed to generate bot response' });
    }
});

// Generate concept summary for a thread
router.post('/concept-summary', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.AI_ASSISTANT), async (req, res) => {
    if (!groq) {
        return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' });
    }
    
    try {
        const { context } = req.body;
        
        if (!context || !context.title || !context.content) {
            return res.status(400).json({ error: 'Missing required context parameters' });
        }
        
        // Craft the system message for concept summary generation
        const systemContent = `You are LearnBridgeEdu Bot, an educational assistant tasked with summarizing discussion threads. 

You need to create a concise, educational summary of the following discussion thread. Focus on:
1. The main educational concepts and questions discussed
2. The key points and insights shared
3. Any conclusions or solutions reached

Provide your summary in a clear, well-structured format. Also identify 3-7 key educational concepts from the discussion that would be helpful for categorizing this thread.

The summary should be approximately 150-250 words.`;

        // Generate the AI response using Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemContent },
                { 
                    role: 'user', 
                    content: `Thread Title: ${context.title}\n\nDiscussion Content: ${context.content}`
                }
            ],
            model: 'llama3-70b-8192', // Or another appropriate model
            temperature: 0.5,
            max_tokens: 800,
            top_p: 0.9,
        });

        // Extract the summary
        const summaryContent = chatCompletion.choices[0].message.content;
        
        // Generate key concepts separately for better structure
        const conceptsPrompt = `Based on this thread: "${context.title}" with content: "${context.content.substring(0, 1000)}...", list only 3-7 key educational concepts as a JSON array of strings. Return only the JSON array, nothing else.`;
        
        const conceptsCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You extract key educational concepts from text and return them as a JSON array of strings. Respond with only the JSON array, no other text.' },
                { role: 'user', content: conceptsPrompt }
            ],
            model: 'llama3-70b-8192',
            temperature: 0.3,
            max_tokens: 200,
            top_p: 0.9,
        });

        // Extract and parse the concepts JSON
        let keyConcepts = [];
        try {
            const conceptsResponse = conceptsCompletion.choices[0].message.content;
            // Extract JSON array from the response
            const jsonMatch = conceptsResponse.match(/\[(.*?)\]/s);
            if (jsonMatch) {
                const jsonStr = jsonMatch[0];
                keyConcepts = JSON.parse(jsonStr);
            } else {
                // Fallback: split by commas if no JSON found
                keyConcepts = conceptsResponse.split(/,\s*/).map(item => {
                    return item.replace(/["\[\]]/g, '').trim();
                }).filter(Boolean);
            }
        } catch (parseError) {
            console.error('Error parsing key concepts:', parseError);
            // If parsing fails, extract concepts manually
            const conceptsText = conceptsCompletion.choices[0].message.content;
            keyConcepts = conceptsText.split('\n')
                .map(line => line.replace(/^[\d*-\s]+|"|\.$/g, '').trim())
                .filter(Boolean);
        }
        
        // Return the generated summary and concepts
        res.json({
            summary: summaryContent,
            key_concepts: keyConcepts
        });
        
    } catch (error) {
        console.error('Error generating concept summary:', error);
        res.status(500).json({ error: 'Failed to generate concept summary' });
    }
});

// Generate learning resources for a thread
router.post('/learning-resources', authenticateToken, checkUsageLimit(usageLimitService.SERVICES.AI_ASSISTANT), async (req, res) => {
    if (!groq) {
        return res.status(503).json({ error: 'AI Service Unavailable: Groq API key not configured.' });
    }
    
    try {
        const { context } = req.body;
        
        if (!context || !context.title || !context.posts || !Array.isArray(context.posts)) {
            return res.status(400).json({ error: 'Missing required context parameters' });
        }
        
        // Prepare context from posts
        const postsContext = context.posts.slice(0, 5).join('\n\n'); // Limit to first 5 posts
        
        // Craft the system message for resource suggestions
        const systemContent = `You are LearnBridgeEdu Bot, an educational assistant responsible for suggesting relevant learning resources based on discussion content.

Analyze the provided forum thread and suggest 3-5 specific learning resources that would help students understand the concepts being discussed. For each resource, provide:
1. A specific title
2. A brief description of what the student will learn
3. A resource type (e.g., Video, Article, Interactive Exercise, Book Chapter, etc.)
4. A specific URL or reference (if you don't have a specific URL, suggest a general source like Khan Academy, YouTube, or a specific textbook)

Format your response as a JSON array containing objects with the following properties: title, description, url, and type.

Example format:
[{"title": "Introduction to Quadratic Equations", "description": "Comprehensive tutorial on solving quadratic equations with examples", "url": "https://www.khanacademy.org/math/algebra/x2f8bb11595b61c86:quadratic-functions-equations", "type": "Tutorial"}, ...]

Make your resource suggestions specific, educational, and directly relevant to the discussion topic.`;

        // Generate the AI response using Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemContent },
                { 
                    role: 'user', 
                    content: `Thread Title: ${context.title}\n\nDiscussion Content: ${postsContext}`
                }
            ],
            model: 'llama3-70b-8192', // Or another appropriate model
            temperature: 0.5,
            max_tokens: 800,
            top_p: 0.9,
        });

        // Extract the response
        const resourcesText = chatCompletion.choices[0].message.content;
        
        // Parse the JSON response
        let resources = [];
        try {
            // Extract JSON array from the response
            const jsonMatch = resourcesText.match(/\[\s*\{.*\}\s*\]/s);
            if (jsonMatch) {
                resources = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No valid JSON found in response');
            }
        } catch (parseError) {
            console.error('Error parsing resources JSON:', parseError);
            // If parsing fails, create a simple response
            resources = [
                {
                    title: 'Additional Resources',
                    description: 'Our AI encountered an error generating specific resources. Please try again later.',
                    url: '#',
                    type: 'Error'
                }
            ];
        }
        
        // Return the generated resources
        res.json(resources);
        
    } catch (error) {
        console.error('Error generating learning resources:', error);
        res.status(500).json({ error: 'Failed to generate learning resources' });
    }
});

module.exports = router;
