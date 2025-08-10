const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);
    
    socket.on('start-screen-share', (data) => {
        logger.info(`Screen share started by ${socket.id}`, data);
        socket.broadcast.emit('screen-share-started', { 
            socketId: socket.id, 
            ...data 
        });
    });
    
    socket.on('stop-screen-share', (data) => {
        logger.info(`Screen share stopped by ${socket.id}`);
        socket.broadcast.emit('screen-share-stopped', { 
            socketId: socket.id, 
            ...data 
        });
    });
    
    socket.on('transcription', (data) => {
        logger.info(`Transcription from ${socket.id}: "${data.text}"`);
        
        // Broadcast to all other clients
        socket.broadcast.emit('new-transcription', {
            socketId: socket.id,
            ...data
        });
    });
    
    socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Access the app at http://localhost:${PORT}`);
});
