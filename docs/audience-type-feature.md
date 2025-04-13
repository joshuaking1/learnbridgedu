# Audience Type Feature Documentation

## Overview

The audience type feature allows administrators to specify which user roles (teachers, students, or both) can access specific SBC document content. This ensures that appropriate content is shown to the right audience.

## Implementation Details

### 1. Frontend Upload Form

In the admin uploads page (`frontend/src/app/admin/uploads/page.tsx`), administrators can select the intended audience for each document:

- **All (Teachers & Students)**: Content visible to all users
- **Teachers Only**: Content visible only to teachers and admins
- **Students Only**: Content visible only to students

The selected audience type is sent to the backend as part of the form data during upload.

### 2. Content Service

The content service (`services/content-service/server.js`) receives the audience type parameter and:

1. Validates that it's one of the allowed values: 'all', 'teacher', or 'student'
2. Passes the audience type to the AI service for document processing

### 3. AI Service

The AI service (`services/ai-service/server.js`) implements audience filtering in several ways:

1. **Document Processing**: When processing uploaded documents, each content chunk is stored with the specified audience type
2. **Vector Search**: When performing vector search for the `/api/ai/ask` endpoint, results are filtered based on the user's role
3. **Content Retrieval**: The `/api/ai/sbc-content` endpoint filters content based on the user's role

### 4. Database Schema

A new column `audience_type` has been added to the `sbc_document_chunks` table with the following properties:

- Data type: VARCHAR(10)
- Default value: 'all'
- Constraint: Must be one of 'all', 'teacher', or 'student'

A migration script is provided in `services/ai-service/migrations/add_audience_type_column.sql`.

## Role-Based Access Rules

1. **Teacher/Admin Users**:
   - Can access content marked as 'all' or 'teacher'
   - Cannot access content marked as 'student'

2. **Student Users**:
   - Can access content marked as 'all' or 'student'
   - Cannot access content marked as 'teacher'

## Usage

1. **For Administrators**:
   - When uploading a document, select the appropriate audience type
   - Use 'Teachers Only' for teacher guides, answer keys, or other content not meant for students
   - Use 'Students Only' for student-specific materials
   - Use 'All' for general curriculum content

2. **For Developers**:
   - When adding new endpoints that access SBC content, ensure they include audience type filtering
   - Use the existing filtering patterns from the `/api/ai/ask` and `/api/ai/sbc-content` endpoints
