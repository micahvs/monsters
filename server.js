const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Handle chat messages
    socket.on('chat', (data) => {
        // Broadcast to all clients in the same room
        if (socket.roomId) {
            socket.to(socket.roomId).emit('chat', {
                sender: data.sender,
                message: data.message
            });
        } else {
            // Broadcast to everyone if no room is set
            socket.broadcast.emit('chat', {
                sender: data.sender,
                message: data.message
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});