const winston = require('winston');

// Custom format untuk log
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format yang lebih readable
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = `\n${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  defaultMeta: { service: 'screen-text-app' },
  transports: [
    // File transport untuk semua log
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Console transport dengan format yang bagus
    new winston.transports.Console({
      format: consoleFormat
    })
  ],
});

// Untuk development, log semua level
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
}

// Helper functions untuk logging yang lebih specific
logger.logAudioCapture = (action, metadata = {}) => {
  logger.info(`AUDIO_CAPTURE: ${action}`, metadata);
};

logger.logScreenShare = (action, metadata = {}) => {
  logger.info(`SCREEN_SHARE: ${action}`, metadata);
};

logger.logTranscription = (action, metadata = {}) => {
  logger.info(`TRANSCRIPTION: ${action}`, metadata);
};

logger.logWebRTC = (action, metadata = {}) => {
  logger.debug(`WEBRTC: ${action}`, metadata);
};

logger.logSocketIO = (action, metadata = {}) => {
  logger.debug(`SOCKET_IO: ${action}`, metadata);
};

module.exports = logger;
