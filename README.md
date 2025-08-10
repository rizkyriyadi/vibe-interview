# 🎤 Vibe Interview - Real-time Audio Transcription

**Full Stack Application** untuk real-time screen audio transcription dengan dukungan Whisper AI dan Web Speech API fallback.

## 🚀 **Quick Start**

### **Menjalankan Aplikasi**

1. **Start Backend Server**
```bash
npm install
npm start
# Server berjalan di http://localhost:3000
```

2. **Start Whisper AI (Optional)**
```bash
./whisper_env/bin/python whisper_server.py
# Whisper server berjalan di http://localhost:5001
```

3. **Buka Browser**
```
http://localhost:3000
```

## 📁 **Struktur Project (Clean)**

```
screen-text/
├── 📁 public/           # Frontend (HTML + JS)
├── 📁 utils/           # Backend utilities (logging)
├── 📁 logs/            # Application logs
├── 📁 whisper_env/     # Python virtual environment
├── server.js          # Main Node.js server
├── whisper_server.py  # Optional AI service
├── package.json       # Dependencies
├── ARCHITECTURE.md    # Detailed documentation
└── README.md         # This file
```

## 🎯 **Fitur Utama**

- ✅ **Real-time Transcription** dengan animasi typing
- ✅ **Dual Provider**: Whisper AI + Web Speech API fallback  
- ✅ **Interview Mode**: Deteksi pertanyaan interviewer
- ✅ **Music Detection**: Auto-pause saat musik terdeteksi
- ✅ **Multi-client Support**: Broadcasting via Socket.IO
- ✅ **Responsive UI**: Modern interface dengan animasi
- ✅ **Download Transcript**: Export ke file .txt

## 🔧 **Tech Stack**

### **Backend**
- **Node.js** + **Express** + **Socket.IO**
- **Winston** untuk logging
- **CORS** untuk cross-origin support

### **Frontend**  
- **Vanilla HTML/CSS/JavaScript**
- **Web APIs**: Screen Capture, MediaRecorder, Web Speech
- **Socket.IO Client** untuk real-time communication

### **AI Service**
- **Python Flask** + **faster-whisper**
- **OpenAI-compatible API** format
- **Optimized untuk Bahasa Indonesia**

## 📡 **API Documentation**

Lihat detail lengkap di [ARCHITECTURE.md](./ARCHITECTURE.md)

### **Backend Endpoints**
- `GET /` - Main application
- `POST /whisper/transcribe` - Audio transcription
- **Socket.IO Events**: transcription, audio-data, screen-share

### **Whisper Service** 
- `GET /health` - Server status
- `POST /transcribe` - Process audio file

## 🌐 **Integration untuk Website Lain**

### **Embed via iframe**
```html
<iframe src="http://your-server.com:3000" width="100%" height="600px"></iframe>
```

### **API Integration**
```javascript
import { io } from 'socket.io-client';
const socket = io('http://your-server.com:3000');

socket.on('new-transcription', (data) => {
    console.log('Live transcript:', data.text);
});
```

## 🚀 **Production Deployment**

1. **Deploy Backend**: Vercel, Railway, DigitalOcean
2. **Deploy Whisper**: Docker container dengan GPU support
3. **HTTPS Required**: Untuk Web APIs security
4. **Environment Variables**: Configure CORS origins

## 📋 **File yang Dihapus (Clean Up)**

- ❌ `server_with_deepgram.js` 
- ❌ `server_clean.js`
- ❌ `public/app_with_deepgram.js`
- ❌ `public/app_clean.js` 
- ❌ `utils/deepgram.js`
- ❌ `@deepgram/sdk` dependency
- ❌ Unused Node.js packages

## 🎪 **Demo & Testing**

1. Buka aplikasi di browser
2. Klik "Start Screen Share"  
3. Pilih tab/aplikasi dengan audio
4. Mulai berbicara → lihat real-time transcription
5. Download transcript sebagai .txt file

**Siap digunakan untuk interview, meeting, atau live transcription!** 🎉
