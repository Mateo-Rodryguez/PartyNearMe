const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const fs = require('fs');
const https = require('https');
const app = express();
const { getUserByEmail } = require('./db');
const generateAuthToken = require('./auth');
const db = require('./db');
const cors = require('cors');

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

// Serving files from  the uploads directory
app.use(cors({
    origin: '*',
    methods: ['GET'],
    allowedHeaders: ['Content-Type']
}));

app.use('/uploads/posts', express.static(path.join(__dirname, '..', 'server', 'uploads', 'posts')));

// Route to login a user
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

// Method to get user posts
app.get('/user/posts', async (req, res) => {
    const { userId, page = 1 } = req.query;
    const postsPerPage = 9;
    const offset = (page - 1) * postsPerPage;

    try {
        // Fetch posts from the user, sorted by newest first
        const postResults = await pool.query(
            `SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [userId, postsPerPage, offset]
        );

        const posts = postResults.rows;

        if (posts.length === 0) {
            return res.json({ posts: [] });
        }

        // Fetch media for the posts
        const postIds = posts.map(post => post.id);
        const mediaResults = await pool.query(
            `SELECT * FROM post_media WHERE post_id = ANY($1)`,
            [postIds]
        );

        const mediaMap = {};
        mediaResults.rows.forEach(media => {
            if (!mediaMap[media.post_id]) {
                mediaMap[media.post_id] = [];
            }
            mediaMap[media.post_id].push(`https://10.0.2.2:5000/uploads/posts/${media.media_url}`);
        });

        // Construct final response
        const formattedPosts = posts.map(post => ({
            id: post.id,
            caption: post.caption,
            location: post.location,
            created_at: post.created_at,
            media: mediaMap[post.id] || []
        }));

        res.json({ posts: formattedPosts });
    } catch (err) {
        console.error('Error fetching user posts:', err.message);
        res.status(500).json({ error: "Server error" });
    }
});

// Recommendation endpoint
const { spawn } = require("child_process");

// Start the recommendation system
const recommendationProcess = spawn("python", ["ml_recommender.py"], {
    stdio: ["pipe", "pipe", "pipe"],  // Ensure stdin works
    detached: false,                  // Keep tied to Node process
    shell: true
});

// Log outputs from Python
recommendationProcess.stdout.on("data", (data) => {
    console.log(`[ML LOG] ${data.toString().trim()}`);
});

recommendationProcess.stderr.on("data", (data) => {
    console.error(`[ML ERROR] ${data.toString().trim()}`);
});

recommendationProcess.on("exit", (code, signal) => {
    console.error(`❌ [ML EXIT] Exited with code ${code}, signal ${signal}`);
});

// API endpoint
app.post("/recommendations", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID required" });

    console.log(`🟢 [API] Requesting recommendations for user ${userId}`);

    try {
        // Fetch all posts excluding user's own posts
        const posts = await pool.query(`
            SELECT p.id, p.caption, p.location, p.like_count, p.user_id, u.email AS username, u.profile_picture
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id != $1
            ORDER BY p.created_at DESC
            LIMIT 100
        `, [userId]);

        console.log(`[API] Found ${posts.rows.length} posts excluding user's own posts`);

        // Fetch posts the user liked
        const userLikes = await pool.query(`
            SELECT p.id, p.caption, p.location
            FROM posts p
            JOIN likes l ON p.id = l.post_id
            WHERE l.user_id = $1
        `, [userId]);

        console.log(`[API] Found ${userLikes.rows.length} liked posts for user ${userId}`);

        // Send posts and user likes to the AI system
        recommendationProcess.stdin.write(JSON.stringify({
            user_id: userId,
            posts: posts.rows,
            user_likes: userLikes.rows
        }) + "\n");

        // Listen for AI recommendation response
        recommendationProcess.stdout.once("data", async (data) => {
            try {
                const postIds = JSON.parse(data.toString().trim());

                // Fetch media URLs for the recommended posts
                const mediaResults = await pool.query(`
                    SELECT post_id, media_url
                    FROM post_media
                    WHERE post_id = ANY($1)
                `, [postIds]);

                const mediaMap = {};
                mediaResults.rows.forEach(media => {
                    if (!mediaMap[media.post_id]) {
                        mediaMap[media.post_id] = [];
                    }
                    mediaMap[media.post_id].push(`https://10.0.2.2:5000/uploads/posts/${media.media_url}`);
                });

                // Enrich the final recommendation response
                const enrichedRecommendations = postIds.map((postId) => {
                    const post = posts.rows.find(p => p.id === postId);
                    if (post) {
                        return {
                            id: post.id,
                            caption: post.caption,
                            location: post.location,
                            likeCount: post.like_count,
                            username: post.username,
                            profilePicture: post.profile_picture || '',
                            mediaUrls: mediaMap[post.id] || []
                        };
                    }
                    return null;
                }).filter(Boolean);

                console.log(`✅ [API] Final recommendations: ${JSON.stringify(enrichedRecommendations)}`);
                res.json(enrichedRecommendations);

            } catch (error) {
                console.error(`❌ [API] Failed to parse recommendation response: ${error}`);
                res.status(500).json({ error: "Failed to get recommendations" });
            }
        });

    } catch (error) {
        console.error(`❌ [DB] Error fetching data: ${error}`);
        res.status(500).json({ error: "Database query failed" });
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});