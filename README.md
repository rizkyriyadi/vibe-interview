# Screen Audio to Text Converter

Aplikasi untuk mengkonversi audio dari screen sharing menjadi text secara real-time.

## Features

- 🎥 Screen sharing dengan audio capture
- 🎤 Real-time speech-to-text conversion
- 📝 Live transcription display
- 📊 Detailed logging
- 💾 Download transcript functionality
- 🔄 Real-time updates via WebSocket

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: HTML + JavaScript + Web APIs
- **Speech Recognition**: Web Speech API
- **Screen Capture**: Screen Capture API
- **Logging**: Winston

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the application:
```bash
npm start
```

3. Open browser and go to: http://localhost:3000

## Usage

1. Klik "Start Screen Share" untuk memulai screen sharing
2. Pilih window/tab yang ingin di-share (pastikan ada audionya)
3. Audio akan secara otomatis dikonversi menjadi text
4. Text akan muncul di area transcription
5. Klik "Download Transcript" untuk menyimpan hasil

## Browser Requirements

- Chrome/Chromium (recommended)
- Firefox (limited support)
- Edge (limited support)

**Note**: Safari tidak mendukung Screen Capture API dengan audio.

## Logging

Application menggunakan Winston untuk logging yang detail:
- `logs/error.log` - Error logs
- `logs/combined.log` - All logs
- Console - Real-time logs

## Development

```bash
# Development mode dengan auto-reload
npm run dev
```

## Common Issues

1. **No audio in screen share**: Pastikan browser mendukung audio capture dan user memberikan permission
2. **Speech recognition error**: Pastikan menggunakan HTTPS di production
3. **Empty transcription**: Cek apakah bahasa yang digunakan sesuai dengan setting (default: Indonesian)

## Next Steps

- Integrasi dengan Google Speech-to-Text API untuk akurasi lebih baik
- Migration ke NestJS
- Database integration untuk menyimpan transcription
- User authentication
- Multiple language support
