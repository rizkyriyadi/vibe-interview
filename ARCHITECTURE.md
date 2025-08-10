# Vibe Interview - Arsitektur Aplikasi

## 🏗️ **Jenis Aplikasi: FULL STACK**

Aplikasi ini adalah **Full Stack Application** yang terdiri dari:
- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML/CSS/JavaScript  
- **AI Service**: Python Flask + Whisper (Optional)

---

## 📋 **Struktur File (Setelah Cleaning)**

```
screen-text/
├── 📁 public/                 # Frontend Files
│   ├── index.html            # UI Interface
│   └── app.js               # Client-side Logic
├── 📁 utils/                 # Backend Utilities
│   └── logger.js            # Winston Logging
├── 📁 logs/                  # Application Logs
├── 📁 whisper_env/           # Python Virtual Environment
├── server.js                # Main Backend Server
├── whisper_server.py        # Optional AI Service
├── package.json             # Node.js Dependencies
└── README.md               # Documentation
```

---

## 🔧 **Backend API Documentation**

### **Server: Node.js Express + Socket.IO**
**Port**: `3000`
**Base URL**: `http://localhost:3000`

### **1. HTTP Endpoints**

#### **Static Files**
```
GET /                    # Serve index.html
GET /app.js             # Serve client JavaScript
```

#### **Whisper Integration** 
```
POST /whisper/transcribe    # Proxy to Whisper service
Body: FormData with audio file
Response: { text: string, timestamp: string }
```

### **2. Socket.IO Events**

#### **Connection Events**
```javascript
// Client connects
socket.on('connect', () => {})

// Client disconnects  
socket.on('disconnect', () => {})
```

#### **Screen Sharing Events**
```javascript
// Client starts screen sharing
socket.emit('screen-share-started', {
    socketId: string,
    timestamp: string
})

// Client stops screen sharing
socket.emit('screen-share-stopped', {
    socketId: string,
    timestamp: string
})
```

#### **Transcription Events**
```javascript
// Client sends transcription result
socket.emit('transcription', {
    text: string,
    confidence: number,
    timestamp: string,
    speaker: 'INTERVIEWER' | 'SPEAKER',
    provider: 'web-speech-api' | 'whisper'
})

// Server broadcasts to all clients
socket.broadcast.emit('new-transcription', transcriptionData)
```

#### **Audio Streaming (Whisper)**
```javascript
// Client sends audio chunks for Whisper processing
socket.emit('audio-data', {
    audio: Uint8Array,
    timestamp: number
})
```

---

## 🤖 **AI Service: Whisper Server**

### **Server: Python Flask**
**Port**: `5001`  
**Base URL**: `http://localhost:5001`

### **Endpoints**

#### **Health Check**
```
GET /health
Response: { status: "ready", model: "small" }
```

#### **Transcribe Audio**
```
POST /transcribe
Body: FormData
  - audio: audio file (webm/wav/mp3)
  - language: "id" (Indonesian) or "en" (English)
  - task: "transcribe"
Response: {
    text: string,
    language: string,
    confidence: number
}
```

---

## 🚀 **Cara Kerja Backend Secara Keseluruhan**

### **1. Server Startup**
```javascript
// 1. Initialize Express server
// 2. Setup Socket.IO for real-time communication  
// 3. Configure CORS for frontend access
// 4. Setup Winston logging
// 5. Start listening on port 3000
```

### **2. Client Connection Flow**
```
1. Client buka http://localhost:3000
2. Download index.html + app.js
3. Socket.IO connection established
4. Client check Whisper server health (port 5001)
5. Initialize speech recognition (Whisper or Web Speech API fallback)
```

### **3. Real-time Transcription Flow**

#### **Dengan Whisper (Optimal)**
```
1. Client capture screen audio via MediaRecorder
2. Audio chunks sent to Node.js via Socket.IO
3. Node.js proxy request to Whisper server (Flask)
4. Whisper process audio → return transcription
5. Node.js send result back to client
6. Client display in UI + broadcast to other clients
```

#### **Fallback Web Speech API**
```
1. Client use browser's Web Speech Recognition
2. Browser process microphone audio directly
3. Results sent to Node.js via Socket.IO
4. Node.js broadcast to all connected clients
5. Real-time display with typing animation
```

### **4. Multi-Client Broadcasting**
```
Client A → Socket.IO → Server → Broadcast → All Clients (A, B, C...)
```

---

## 🌐 **Integrasi ke Website Lain**

### **Scenario 1: Embed dalam Website**
```html
<!-- Di website temen lu -->
<iframe 
    src="http://your-server.com:3000" 
    width="100%" 
    height="600px">
</iframe>
```

### **Scenario 2: Integration via API**
```javascript
// Website temen lu bisa consume Socket.IO events
import { io } from 'socket.io-client';

const socket = io('http://your-server.com:3000');

socket.on('new-transcription', (data) => {
    // Handle real-time transcription di website lain
    console.log('Live transcript:', data.text);
});
```

### **Scenario 3: Standalone Deployment**
```bash
# Deploy to cloud server (Vercel, Railway, DigitalOcean)
# Frontend: Static hosting
# Backend: Node.js hosting  
# Whisper: Docker container or cloud GPU
```

---

## 📦 **Dependencies yang Diperlukan**

### **Backend (Node.js)**
```json
{
  "axios": "^1.11.0",        // HTTP client for Whisper API
  "cors": "^2.8.5",          // Cross-origin requests
  "express": "^4.18.2",      // Web server framework
  "form-data": "^4.0.4",     // Form data handling
  "socket.io": "^4.7.2",     // Real-time communication
  "winston": "^3.10.0"       // Logging system
}
```

### **AI Service (Python)**
```txt
faster-whisper==0.3.0      # Whisper implementation
Flask==2.3.2               # Web framework
Flask-CORS==4.0.0          # CORS handling
```

---

## 🔒 **Security Considerations**

### **Production Deployment**
1. **HTTPS Required**: Web APIs need secure context
2. **CORS Configuration**: Whitelist allowed origins
3. **Rate Limiting**: Prevent abuse of transcription API
4. **Authentication**: Optional user authentication
5. **File Size Limits**: Limit audio upload size

### **Environment Variables**
```bash
# .env.production
NODE_ENV=production
PORT=3000
WHISPER_SERVER_URL=http://localhost:5001
LOG_LEVEL=error
CORS_ORIGIN=https://yourdomain.com
```

---

## 🎯 **Use Cases untuk Website Lain**

1. **Live Meeting Transcription**: Real-time captions untuk video calls
2. **Interview Recording**: Otomatis transcribe interview sessions  
3. **Lecture Notes**: Convert kuliah ke text real-time
4. **Accessibility**: Subtitle otomatis untuk konten audio/video
5. **Content Creation**: Transcribe podcast/video untuk SEO

**Ready untuk production dengan sedikit konfigurasi!** 🚀
