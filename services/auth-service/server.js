// services/auth-service/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); // Import db connection
const authenticateToken = require('./middleware/authenticateToken'); // Import auth middleware

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple Route for Testing
app.get('/api/auth/health', (req, res) => {
    res.status(200).json({ status: 'Auth Service is Up!' });
});

// --- Auth Routes ---

// Register User (POST /api/auth/register)
app.post('/api/auth/register', async (req, res) => {
    const { firstName, surname, school, location, position, email, phone, gender, password } = req.body;

    // ** Basic Validation (Add more robust validation later!) **
    if (!email || !password || !firstName || !surname) {
        return res.status(400).json({ error: 'Missing required fields (email, password, firstName, surname).' });
    }

    try {
        // 1. Check if user already exists
        const userExists = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists.' });
        }

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10); // Generate salt
        const hashedPassword = await bcrypt.hash(password, salt); // Hash password

        // 3. Insert new user into the database (Assumes 'users' table exists)
        // We need to coordinate this potentially with the User Service or have the table structure defined.
        // For now, let's assume the Auth service can write the core user details needed for auth.
        const newUserQuery = `
            INSERT INTO users (first_name, surname, school, location, position, email, phone, gender, password_hash, role)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, email, role, first_name;
        `;
        // Default role could be 'student' or 'teacher' based on 'position' or another field
        const defaultRole = position === 'Teacher' ? 'teacher' : 'student'; // Basic example
        const values = [firstName, surname, school, location, position, email, phone, gender, hashedPassword, defaultRole];

        const result = await db.query(newUserQuery, values);
        const newUser = result.rows[0];

        // 4. Generate JWT Token (Optional: maybe login immediately after register)
        // const token = jwt.sign(
        //     { userId: newUser.id, email: newUser.email, role: newUser.role },
        //     process.env.JWT_SECRET,
        //     { expiresIn: process.env.JWT_EXPIRES_IN }
        // );

        // 5. Send Response (without token initially, require login)
         res.status(201).json({
            message: 'User registered successfully. Please log in.',
            user: {
                id: newUser.id,
                email: newUser.email,
                firstName: newUser.first_name,
                role: newUser.role
            }
            // token: token // Uncomment if you want auto-login
        });

    } catch (err) {
        console.error("Registration Error:", err);
        // Check for specific DB errors if needed (e.g., unique constraint violation)
        res.status(500).json({ error: 'Internal Server Error during registration.' });
    }
});

// Login User (POST /api/auth/login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide email and password.' });
    }

    try {
        // 1. Find user by email
        const result = await db.query('SELECT id, email, password_hash, role, first_name FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' }); // User not found
        }

        // 2. Compare submitted password with stored hash
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' }); // Password incorrect
        }

        // 3. Generate JWT Token
        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role }, // Payload: Data stored in the token
            process.env.JWT_SECRET, // Your secret key
            { expiresIn: process.env.JWT_EXPIRES_IN } // Expiration time
        );

        // 4. Send Token and User Info back
        res.status(200).json({
            message: 'Login successful',
            token: token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                role: user.role
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: 'Internal Server Error during login.' });
    }
});

// Refresh Token (POST /api/auth/refresh-token)
app.post('/api/auth/refresh-token', authenticateToken, async (req, res) => {
    // This endpoint requires a valid token to refresh it
    // The authenticateToken middleware will verify the token and add the user to req.user

    try {
        // Get user ID from the token payload (added by authenticateToken middleware)
        const userId = req.user.userId;
        const userEmail = req.user.email;
        const userRole = req.user.role;

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        // Verify that the user still exists in the database
        const result = await db.query('SELECT id, email, role, first_name FROM users WHERE id = $1', [userId]);
        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Generate a new token with a new expiration time
        const newToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        // Return the new token
        res.status(200).json({
            message: 'Token refreshed successfully',
            token: newToken
        });

    } catch (err) {
        console.error('Token refresh error:', err);
        res.status(500).json({ error: 'Internal server error during token refresh' });
    }
});

// TODO: Add routes for password reset request, password reset execution

// Start the server
app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
});