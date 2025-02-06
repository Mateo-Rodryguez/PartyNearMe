require('dotenv').config();
const { Pool } = require('pg');

// Pool to manage connections
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

const getUserByEmail = async (email) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error fetching user by email:', err.message); // Log the error details
        throw err;
    }
};

const saveMessage = async (conversationId, senderId, receiverId, message_body) => {
    try {
         console.log("Saving message with values:", { conversationId, senderId, receiverId, message_body });
        const result = await pool.query(
            'INSERT INTO messages (conversation_id, sender_id, receiver_id, message_body) VALUES ($1, $2, $3, $4) RETURNING *',
            [conversationId, senderId, receiverId, message_body]
        );

        if (result.rows.length === 0) {
            throw new Error("Conversation ID does not exist");
        }

        return result.rows[0];
    } catch (err) {
        console.error("Error saving message:", err.message);
        throw err;
    }
};


module.exports = {
    getUserByEmail,
    saveMessage,
    pool,
};