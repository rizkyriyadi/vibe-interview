# Screen Audio to Text Application

This is a real-time screen sharing audio-to-text converter application.

## Project Structure

- **Backend**: Node.js + Express + Socket.IO server
- **Frontend**: Vanilla HTML/CSS/JavaScript with Web APIs
- **Key Features**: Screen capture, audio extraction, speech-to-text, real-time transcription

## Key Files

- `server.js` - Main Express server with Socket.IO
- `utils/logger.js` - Winston-based logging system
- `public/index.html` - Frontend UI
- `public/app.js` - Frontend JavaScript application
- `logs/` - Application logs directory

## Web APIs Used

- **Screen Capture API**: For screen sharing with audio
- **Web Speech API**: For speech-to-text conversion
- **MediaRecorder API**: For audio data handling
- **WebSocket/Socket.IO**: For real-time communication

## Development Guidelines

1. **Logging**: Use the logger utility for all server-side logging
2. **Error Handling**: Always wrap async operations in try-catch
3. **Audio Handling**: Ensure proper cleanup of media streams
4. **Browser Compatibility**: Primary support for Chrome/Chromium

## Current Limitations

- Requires HTTPS in production for security APIs
- Limited browser support (Chrome recommended)
- Uses Web Speech API (not as accurate as cloud services)

## Next Migration

This is a proof-of-concept. Next phase will migrate to NestJS with:
- Google Speech-to-Text API integration
- Database persistence
- User authentication
- Better error handling and retry mechanisms
