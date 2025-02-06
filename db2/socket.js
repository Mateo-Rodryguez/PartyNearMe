const fs = require('fs');
const https = require('https');
const socketIo = require('socket.io');
const db = require('./db');
const express = require('express');
const app = express();

// Create HTTPS server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT);


app.use(express.static('public'));  // Serve static files from public directory
console.log('Server running');
// Initialize Socket.io
const io = socketIo(server); 

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on("connect_error", (err) => {
  // the reason of the error, for example "xhr poll error"
  console.log(err.message);

  // some additional description, for example the status code of the initial HTTP response
  console.log(err.description);

  // some additional context, for example the XMLHttpRequest object
  console.log(err.context);});

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
