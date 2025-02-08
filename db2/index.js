const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const fs = require('fs');
const https = require('https');
const app = express();
const { getUserByEmail } = require('./db');
const generateAuthToken = require('./auth');
const db = require('./db');

app.use(express.json()); // Middleware to parse JSON requests

const multer = require('multer');
const path = require('path');

// Set up Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '..', 'server', 'uploads', 'posts')); // Save files to server/uploads/posts/
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Unique file names
    }
});

const upload = multer({ storage: storage });


app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = generateAuthToken(user);
        res.json({ token, userId: user.id });
    } catch (error) {
        console.error('Error during login:', error); // Log the error details
        res.status(500).json({ error: "Internal server error" });
    }
});

// Route to add a user (register user)
app.post('/users', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Checking if the user exists
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(409).json({ message: 'User already exists' });
        }
        // Hashing the password
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
            [email, hashedPassword]
        );
        res.status(201).json(result.rows[0]); // Return the created user
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
// Route to fetch all users
app.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        res.json(result.rows); 
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.post('/conversations/find-or-create', async (req, res) => {
    const { senderId, receiverId } = req.body;
    try {
        // Find an existing conversation between these two users
        const existingConversation = await pool.query(
            'SELECT conversation_id FROM messages WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1) LIMIT 1',
            [senderId, receiverId]
        );

        if (existingConversation.rows.length > 0) {
            return res.json({ conversationId: existingConversation.rows[0].conversation_id });
        }

        // Find the last used conversation_id and increment it
        const lastConversation = await pool.query(
            'SELECT MAX(conversation_id) AS last_id FROM messages'
        );

        const lastId = lastConversation.rows[0].last_id || 0;
        const newConversationId = lastId + 1;

        res.json({ conversationId: newConversationId });
    } catch (err) {
        console.error('Error creating or finding conversation:', err.message);
        res.status(500).send('Server error');
    }
});

// Multer middleware to upload media files
app.post('/posts', upload.array('media', 10), async (req, res) => {
    const { userId, caption, location } = req.body;
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "At least one media file is required" });
    }

    try {
        // Insert into posts table
        const postResult = await pool.query(
            'INSERT INTO posts (user_id, caption, location) VALUES ($1, $2, $3) RETURNING id',
            [userId, caption || null, location || null]
        );
        const postId = postResult.rows[0].id;

        // Insert each media file into post_media table
        const mediaInserts = req.files.map(file =>
            pool.query(
                'INSERT INTO post_media (post_id, media_url) VALUES ($1, $2)',
                [postId, file.filename] // Save filename, not full path
            )
        );

        await Promise.all(mediaInserts);

        res.status(201).json({ message: "Post created successfully", postId });
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


// Read the SSL certificate and key
const sslOptions = {
    key: fs.readFileSync('./certs/certs2/server.key'),
    cert: fs.readFileSync('./certs/certs2/server.crt'),
}
// Start the server
const PORT = process.env.PORT || 5000;
const server = https.createServer(sslOptions, app);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});