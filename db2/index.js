const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const fs = require('fs');
const https = require('https');
const app = express();
const { getUserByEmail } = require('./db');
const socketIo = require('socket.io');
const generateAuthToken = require('./auth');
const db = require('./db');

app.use(express.json()); // Middleware to parse JSON requests

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
// Conversations find or create
/*
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

        // If no conversation exists, create a new conversation ID
        const newConversation = await pool.query(
            'INSERT INTO messages DEFAULT VALUES RETURNING conversation_id'
        );

        res.json({ conversationId: newConversation.rows[0].conversation_id });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
*/
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


// Read the SSL certificate and key
const sslOptions = {
    key: fs.readFileSync('./certs/certs2/server.key'),
    cert: fs.readFileSync('./certs/certs2/server.crt'),
}
// Start the server
const PORT = process.env.PORT || 5000;
const server = https.createServer(sslOptions, app);

const io = socketIo(server, {
    cors: {
        origin: "*",  // Allow frontend connections
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('sendMessage', async (data) => {
        console.log('Received data:', data);
        const { conversationId, senderId, receiverId, message_body } = data;
        try {
            const savedMessage = await db.saveMessage(conversationId, senderId, receiverId, message_body);
            io.to(conversationId).emit('receiveMessage', savedMessage);
        } catch (err) {
            console.error('Error sending message:', err.message);
        }
    });
    socket.on('joinConversation', (conversationId) => {
        socket.join(conversationId);
        socket.emit('conversationJoined', conversationId);
        console.log(`User joined conversation ${conversationId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});