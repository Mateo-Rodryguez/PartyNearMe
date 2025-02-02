const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('./db');
const fs = require('fs');
const https = require('https');
const app = express();
const { getUserByEmail } = require('./db');
const socketIo = require('socket.io');

app.use(express.json()); // Middleware to parse JSON requests

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await getUserByEmail(email);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.status(200).json({ email: user.email, message: 'Login successful' });
    } catch (err) {
        console.error('Error during login:', err.message);
        res.status(500).send('Server error');
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

// Messages
app.post('/messages', async (req, res) => {
    const { conversationId, senderId, messageBody, mediaUrl } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO messages (conversation_id, sender_id, message_body, media_url, timestamp, is_read) 
             VALUES ($1, $2, $3, $4, NOW(), FALSE) RETURNING *`,
            [conversationId, senderId, messageBody, mediaUrl]
        );

        // Emit message to all clients in the conversation room
        io.to(conversationId).emit('receiveMessage', result.rows[0]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.get('/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY timestamp ASC`,
            [conversationId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.put('/conversations/:conversationId/messages/read', async (req, res) => {
    const { conversationId } = req.params;
    const { userId } = req.body; // userId of the message reader

    try {
        await pool.query(
            `UPDATE messages SET is_read = TRUE 
             WHERE conversation_id = $1 AND sender_id != $2`,
            [conversationId, userId]
        );

        res.json({ status: "Messages marked as read" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});


app.patch('/messages/:messageId/status', async (req, res) => {
    const { messageId } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE messages SET status = $1 WHERE id = $2 RETURNING *',
            [status, messageId]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
// Conversations
app.post('/conversations/find-or-create', async (req, res) => {
    const { user1, user2 } = req.body;
    try {
        // Check if a conversation already exists
        const existingConversation = await pool.query(
            'SELECT * FROM conversations WHERE (user1 = $1 AND user2 = $2) OR (user1 = $2 AND user2 = $1)',
            [user1, user2]
        );

        if (existingConversation.rows.length > 0) {
            return res.json(existingConversation.rows[0]);
        }

        // If not, create a new one
        const newConversation = await pool.query(
            'INSERT INTO conversations (user1, user2) VALUES ($1, $2) RETURNING *',
            [user1, user2]
        );

        res.json(newConversation.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

app.post('/conversations', async (req, res) => {
    const { name, creatorId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO conversations (name, creator_id) VALUES ($1, $2) RETURNING *',
            [name, creatorId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
app.get('/users/:userId/conversations', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM conversations WHERE id IN (SELECT conversation_id FROM participants WHERE user_id = $1)',
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
app.post('/conversations/:conversationId/participants', async (req, res) => {
    const { conversationId } = req.params;
    const { userId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO participants (conversation_id, user_id) VALUES ($1, $2) RETURNING *',
            [conversationId, userId]
        );
        io.to(conversationId).emit('participantAdded', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});
// Reactions
app.post('/messages/:messageId/reactions', async (req, res) => {
    const { messageId } = req.params;
    const { userId, reaction } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO reactions (message_id, user_id, reaction) VALUES ($1, $2, $3) RETURNING *',
            [messageId, userId, reaction]
        );
        io.to(messageId).emit('reactionAdded', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
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
            const { conversationId, senderId, content } = data;
            try {
                const result = await pool.query(
                    'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
                    [conversationId, senderId, content]
                );
                io.to(conversationId).emit('receiveMessage', result.rows[0]);
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
    console.log('Server running on port ${PORT}');
});


