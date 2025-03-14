// Handle chat messages
socket.on('chat', (data) => {
    // Broadcast to all clients in the same room
    socket.to(socket.roomId).emit('chat', {
        sender: data.sender,
        message: data.message
    });
}); 