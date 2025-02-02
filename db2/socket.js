const { pool } = require('./db');
const socketIo = require('socket.io');

module.exports = (server) => {
    const io = socketIo(server);

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
            console.log(`User joined conversation ${conversationId}`);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });

    return io; // Export io in case it's needed elsewhere
};
