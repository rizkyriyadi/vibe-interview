const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const logger = require('./utils/logger');
const DeepgramService = require('./utils/deepgram');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Deepgram service
const deepgram = new DeepgramService();

// Set callback for transcription results
deepgram.setTranscriptionCallback((transcriptionData) => {
  // Broadcast to specific socket and all clients
  const targetSocket = io.sockets.sockets.get(transcriptionData.socketId);
  if (targetSocket) {
    targetSocket.emit('deepgram-transcription', transcriptionData);
  }
  
  // Also broadcast to all clients for real-time sharing
  io.emit('new-transcription', transcriptionData);
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Logger middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  logger.info('Home page accessed');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  logger.info('Health check accessed');
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    deepgram: deepgram.getActiveConnections().length > 0 ? 'Connected' : 'Ready'
  });
});

// Deepgram health check endpoint
app.get('/deepgram-status', async (req, res) => {
  try {
    const isConnected = await deepgram.testConnection();
    res.json({
      status: isConnected ? 'Connected' : 'Failed',
      activeConnections: deepgram.getActiveConnections().length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO untuk real-time communication + Deepgram integration
io.on('connection', (socket) => {
  logger.info(`New client connected: ${socket.id}`);

  // Handle screen sharing start with Deepgram
  socket.on('start-screen-share', async (data) => {
    logger.info(`Screen sharing started by ${socket.id}`, { data });
    
    try {
      // Create Deepgram live connection for this socket
      await deepgram.createLiveConnection(socket.id);
      socket.emit('deepgram-ready', { status: 'connected' });
      logger.info(`✅ Deepgram connection ready for ${socket.id}`);
    } catch (error) {
      logger.error(`Failed to create Deepgram connection for ${socket.id}:`, error);
      socket.emit('deepgram-error', { error: error.message });
    }
    
    socket.broadcast.emit('screen-share-started', { socketId: socket.id });
  });

  // Handle audio data - send to Deepgram instead of just logging
  socket.on('audio-data', async (audioData) => {
    try {
      logger.debug(`📥 Audio data received from ${socket.id}`, { 
        dataSize: audioData ? (audioData.size || audioData.length || 0) : 0 
      });
      
      // Send audio data to Deepgram
      if (audioData && (audioData.size > 0 || audioData.length > 0)) {
        deepgramService.sendAudioData(socket.id, audioData);
        logger.debug(`✅ Audio sent to Deepgram for ${socket.id}`);
      } else {
        logger.warn(`⚠️ Empty audio data from ${socket.id}`);
      }
      
    } catch (error) {
      logger.error(`❌ Error processing audio data from ${socket.id}: ${error.message}`);
      socket.emit('deepgram-error', { error: error.message });
    }
  });

  // Handle legacy transcription (Web Speech API fallback)
  socket.on('transcription', (data) => {
    logger.info(`Legacy transcription received from ${socket.id}`, { 
      text: data.text,
      confidence: data.confidence,
      timestamp: data.timestamp,
      provider: 'web-speech-api'
    });
    
    // Broadcast legacy transcription
    io.emit('new-transcription', {
      ...data,
      socketId: socket.id,
      provider: 'web-speech-api'
    });
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error(`Error from client ${socket.id}`, { error });
  });

  // Handle disconnect - cleanup Deepgram connection
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
    
    // Close Deepgram connection
    deepgram.closeConnection(socket.id);
    
    socket.broadcast.emit('screen-share-stopped', { socketId: socket.id });
  });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Access the app at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
