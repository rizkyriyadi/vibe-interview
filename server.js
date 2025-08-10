const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const logger = require('./utils/logger');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Whisper API configuration
const WHISPER_API_URL = 'http://localhost:5000/v1/audio/transcriptions';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Whisper transcription function
async function transcribeWithWhisper(audioBuffer, language = 'id') {
    try {
        // Create temporary file
        const tempPath = path.join(__dirname, 'temp_audio.webm');
        fs.writeFileSync(tempPath, audioBuffer);
        
        // Create form data
        const formData = new FormData();
        formData.append('file', fs.createReadStream(tempPath));
        formData.append('language', language);
        formData.append('response_format', 'json');
        
        // Send to Whisper API
        const response = await axios.post(WHISPER_API_URL, formData, {
            headers: {
                ...formData.getHeaders(),
            },
            timeout: 30000 // 30 second timeout
        });
        
        // Clean up temp file
        try {
            fs.unlinkSync(tempPath);
        } catch (e) {
            logger.warn(`Failed to delete temp file: ${e.message}`);
        }
        
        return response.data;
        
    } catch (error) {
        logger.error(`Whisper transcription error: ${error.message}`);
        throw error;
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    logger.info(`New client connected: ${socket.id}`);
    
    socket.on('start-screen-share', (data) => {
        logger.info(`Screen share started by ${socket.id}`, data);
        
        // Notify client that Whisper is ready
        socket.emit('whisper-ready', { 
            status: 'connected',
            api_url: WHISPER_API_URL 
        });
        
        socket.broadcast.emit('screen-share-started', { 
            socketId: socket.id, 
            ...data 
        });
    });
    
    socket.on('audio-data', async (audioData) => {
        logger.info(`Received audio data from ${socket.id}: ${audioData.length || audioData.size || 'unknown'} bytes`);
        
        try {
            // Convert audio data to buffer if needed
            let audioBuffer;
            if (Buffer.isBuffer(audioData)) {
                audioBuffer = audioData;
            } else if (audioData.buffer) {
                audioBuffer = Buffer.from(audioData.buffer);
            } else {
                audioBuffer = Buffer.from(audioData);
            }
            
            // Transcribe with Whisper
            const transcription = await transcribeWithWhisper(audioBuffer, 'id');
            
            if (transcription.text && transcription.text.trim().length > 0) {
                logger.info(`Whisper transcription: "${transcription.text}"`);
                
                // Send transcription back to client
                socket.emit('whisper-transcription', {
                    text: transcription.text,
                    language: transcription.language,
                    duration: transcription.duration,
                    confidence: 0.95, // Whisper doesn't provide confidence, use default
                    is_final: true,
                    timestamp: new Date().toISOString(),
                    provider: 'whisper'
                });
            }
            
        } catch (error) {
            logger.error(`Failed to transcribe audio for ${socket.id}: ${error.message}`);
            socket.emit('whisper-error', { error: error.message });
        }
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
