const { createClient } = require('@deepgram/sdk');
const logger = require('./logger');

class DeepgramService {
    constructor() {
        this.apiKey = '33013a387f738938f17e5554fac1ad904fd6f894';
        this.client = createClient(this.apiKey);
        this.connections = new Map(); // Store active connections
        
        logger.info('🎤 Deepgram service initialized');
    }
    
    async createLiveConnection(socketId) {
        try {
            const connection = this.client.listen.live({
                model: 'nova-2',
                language: 'id', // Indonesian, bisa 'en' untuk English
                smart_format: true,
                interim_results: true,
                endpointing: 300, // 300ms silence detection
                vad_events: true,
                utterance_end_ms: 1000,
                punctuate: true,
                diarize: false, // Speaker diarization off for now
                multichannel: false,
                alternatives: 3, // Get 3 alternatives for better accuracy
                profanity_filter: false,
                redact: false,
                numerals: true,
                search: ['interview', 'pertanyaan', 'question', 'jawaban'], // Highlight key terms
            });
            
            // Setup event handlers
            connection.on('open', () => {
                logger.info(`🟢 Deepgram connection opened for socket: ${socketId}`);
            });
            
            connection.on('Results', (data) => {
                const result = data.channel.alternatives[0];
                if (result && result.transcript.trim()) {
                    const transcriptionData = {
                        text: result.transcript.trim(),
                        confidence: result.confidence,
                        is_final: data.is_final,
                        start: data.start,
                        duration: data.duration,
                        words: data.channel.alternatives[0].words || [],
                        socketId: socketId,
                        timestamp: new Date().toISOString(),
                        provider: 'deepgram'
                    };
                    
                    logger.info(`📝 Deepgram ${data.is_final ? 'FINAL' : 'interim'}: "${result.transcript}" (${(result.confidence * 100).toFixed(1)}%)`);
                    
                    // Emit to specific socket
                    this.onTranscriptionReceived(transcriptionData);
                }
            });
            
            connection.on('Metadata', (data) => {
                logger.debug(`📊 Deepgram metadata for ${socketId}:`, data);
            });
            
            connection.on('Speech Started', () => {
                logger.debug(`🗣️  Speech started detected for ${socketId}`);
            });
            
            connection.on('Speech Ended', () => {
                logger.debug(`🤐 Speech ended detected for ${socketId}`);
            });
            
            connection.on('Utterance End', (data) => {
                logger.info(`✅ Utterance completed for ${socketId}: "${data.channel.alternatives[0].transcript}"`);
            });
            
            connection.on('error', (error) => {
                logger.error(`❌ Deepgram error for ${socketId}:`, error);
            });
            
            connection.on('close', () => {
                logger.info(`🔴 Deepgram connection closed for ${socketId}`);
                this.connections.delete(socketId);
            });
            
            // Store connection
            this.connections.set(socketId, connection);
            
            logger.info(`✅ Deepgram live connection created for ${socketId}`);
            return connection;
            
        } catch (error) {
            logger.error(`Failed to create Deepgram connection for ${socketId}:`, error);
            throw error;
        }
    }
    
    async sendAudio(audioData) {
        // This method will be called from server.js
        // We need the socketId to get the right connection
        logger.warn('⚠️ sendAudio called without socketId - use sendAudioData instead');
    }
    
    sendAudioData(socketId, audioData) {
        const connection = this.connections.get(socketId);
        if (connection && connection.getReadyState() === 1) {
            try {
                connection.send(audioData);
                logger.debug(`🎵 Audio data sent to Deepgram for ${socketId}: ${audioData.length || audioData.size || 'unknown'} bytes`);
            } catch (error) {
                logger.error(`Failed to send audio to Deepgram for ${socketId}:`, error);
            }
        } else {
            logger.warn(`⚠️ No active Deepgram connection for ${socketId}`);
        }
    }
    
    closeConnection(socketId) {
        const connection = this.connections.get(socketId);
        if (connection) {
            try {
                connection.finish();
                this.connections.delete(socketId);
                logger.info(`🔌 Deepgram connection closed for ${socketId}`);
            } catch (error) {
                logger.error(`Error closing Deepgram connection for ${socketId}:`, error);
            }
        }
    }
    
    setTranscriptionCallback(callback) {
        this.onTranscriptionReceived = callback;
    }
    
    getActiveConnections() {
        return Array.from(this.connections.keys());
    }
    
    // Health check
    async testConnection() {
        try {
            const response = await this.client.manage.getProjectBalances();
            logger.info('✅ Deepgram API connection successful');
            logger.info(`💰 Account balance: $${response.balances[0]?.amount || 'Unknown'}`);
            return true;
        } catch (error) {
            logger.error('❌ Deepgram API connection failed:', error);
            return false;
        }
    }
}

module.exports = DeepgramService;
