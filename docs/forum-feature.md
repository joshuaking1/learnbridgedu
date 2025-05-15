# LearnBridge Educational Forum Feature

## Overview

The LearnBridge Forum is a comprehensive discussion platform integrated with your LearnBridge educational ecosystem. It provides students and educators with a space for collaborative learning, knowledge sharing, and AI-assisted education.

## Key Features

### Core Forum Features

- **Organized Forums**: Categorized discussion spaces for different subjects and topics
- **Threaded Discussions**: Hierarchical conversation structure with replies
- **Rich Content Support**: Formatting, code blocks, and markdown support
- **Tagging System**: Organize and find content by topic tags

### User Engagement Features

- **Reactions**: Like, helpful, and other reaction types
- **Solution Marking**: Identify definitive answers to questions
- **Real-time Updates**: Immediate notifications for new content

### LearnBridgeEdu Bot Integration

- **AI Assistance**: Bot that provides educational support in discussions
- **Concept Summaries**: AI-generated summaries of discussion topics
- **Learning Resources**: Automatically suggested relevant materials
- **Intelligent Responses**: Context-aware answers to student questions

## Technical Architecture

### Backend Services

The forum feature is built as part of your microservices architecture:

- **Discussion Service**: Main service handling forums, threads, and posts
- **Integration with AI Service**: For LearnBridgeEdu Bot functionality
- **Event-driven Updates**: Real-time notifications via WebSockets

### Frontend Components

- **Forum Listing**: Browse available discussion spaces
- **Thread Views**: View and participate in conversations
- **Thread Creation**: Start new discussions
- **AI Assistant Interface**: Access bot functions and insights

## Setup Instructions

### Database Setup

1. Create the necessary database tables by running the provided schema file
2. Connect the discussion service to your database with proper credentials

### Backend Configuration

1. Configure environment variables in the discussion service:
   - `DATABASE_URL`: Your PostgreSQL database connection string
   - `DISCUSSION_SERVICE_PORT`: Port for the discussion service (default: 3007)
   - `AI_SERVICE_URL`: URL of your AI service for bot integration
   - `BOT_USER_ID`: User ID for the LearnBridgeEdu Bot

2. Ensure the discussion service has access to Clerk for authentication

### Running the Services

1. Install dependencies for the discussion service:
   ```
   cd services/discussion-service
   npm install
   ```

2. Start the service:
   ```
   npm run dev
   ```

## Usage Guide

### For Students

1. **Browsing Forums**: Navigate to the forum section to view available discussion spaces
2. **Creating Threads**: Start new discussions with questions or topics
3. **Participating**: Reply to existing threads and engage with peers
4. **Using the Bot**: Mention @LearnBridgeEdu in posts to get AI assistance

### For Educators

1. **Monitoring Discussions**: Keep track of student conversations
2. **Creating Forums**: Set up structured discussion spaces for your courses
3. **Highlighting Solutions**: Mark definitive answers to student questions
4. **Leveraging AI Insights**: Use bot-generated summaries and learning resources

## Integration Points

- **User Service**: User profiles and authentication
- **Content Service**: Linking discussions to educational content
- **Notification Service**: Alerting users of relevant activity
- **AI Service**: Powering the LearnBridgeEdu Bot

## Customization and Extension

The forum system is designed to be extensible. You can:

1. Add new reaction types by modifying the validReactions array
2. Implement additional bot capabilities by enhancing the bot.js routes
3. Create new moderation tools by extending the server permissions
4. Add analytics features to track engagement and learning patterns

## Troubleshooting

- **Database Connectivity Issues**: Ensure your DATABASE_URL is correctly configured
- **Authentication Problems**: Verify Clerk integration is properly set up
- **AI Service Connection**: Check that your AI_SERVICE_URL is accessible
- **WebSocket Issues**: Ensure the Socket.IO setup is properly configured
