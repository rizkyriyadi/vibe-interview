// Whisper API Client
class WhisperClient {
    constructor() {
        this.baseURL = 'http://localhost:5001'; // Whisper server URL (changed from 5000 to 5001)
    }

    async checkServerHealth() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            const data = await response.json();
            return data.status === 'ready';
        } catch (error) {
            console.error('Whisper server not available:', error);
            return false;
        }
    }

    async transcribeAudio(audioBlob) {
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'audio.webm');
            formData.append('language', 'id'); // Indonesian
            formData.append('task', 'transcribe');

            const response = await fetch(`${this.baseURL}/transcribe`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Whisper transcription error:', error);
            throw error;
        }
    }
}

class ScreenAudioToText {
    constructor() {
        this.socket = io();
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.recognition = null;
        this.isRecording = false;
        this.transcriptions = [];
        
        // Whisper integration
        this.useWhisper = true;
        this.whisperReady = false;
        this.whisperClient = null;
        this.audioChunks = [];
        
        // Audio analysis for music detection
        this.audioContext = null;
        this.analyser = null;
        this.audioLevelHistory = [];
        this.musicThreshold = 0.7;
        this.suppressTranscription = false;
        
        this.initializeElements();
        this.initializeSocketEvents();
        this.initializeSpeechRecognition(); // Fallback only
        this.bindEvents();
        
        this.log('🚀 Application initialized - Whisper API mode', 'info');
    }
    
    initializeElements() {
        // Control buttons
        this.startBtn = document.getElementById('startShareBtn');
        this.stopBtn = document.getElementById('stopShareBtn');
        this.toggleAudioBtn = document.getElementById('toggleAudioBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.clearLogsBtn = document.getElementById('clearLogsBtn');
        
        // Display areas
        this.statusDiv = document.getElementById('status');
        this.transcriptionArea = document.getElementById('transcriptionArea');
        this.logsArea = document.getElementById('logsArea');
        this.previewVideo = document.getElementById('previewVideo');
        
        // Validate critical elements
        if (!this.transcriptionArea) {
            console.error('❌ Critical: transcriptionArea element not found!');
            this.log('❌ Critical: transcript area element missing from DOM', 'error');
        } else {
            this.log('✅ All DOM elements initialized successfully', 'success');
        }
    }
    
    initializeSocketEvents() {
        this.socket.on('connect', () => {
            this.log(`Connected to server with ID: ${this.socket.id}`, 'success');
        });
        
        this.socket.on('disconnect', () => {
            this.log('Disconnected from server', 'warning');
        });
        
        // Whisper events
        this.socket.on('whisper-ready', (data) => {
            this.whisperReady = true;
            this.log('🎤 Whisper API ready - Real-time transcription active!', 'success');
            this.updateStatus('🎤 Whisper Active - Processing Audio', true);
        });
        
        this.socket.on('whisper-error', (data) => {
            this.log(`❌ Whisper error: ${data.error}`, 'error');
            this.updateStatus('❌ Whisper Error - Check connection', false);
        });
        
        this.socket.on('whisper-transcription', (data) => {
            this.log(`🎯 Whisper: "${data.text}" (${(data.confidence * 100).toFixed(1)}%)`, 'success');
            
            // Add transcription to UI
            this.addTranscription({
                text: data.text,
                confidence: data.confidence,
                timestamp: data.timestamp,
                speaker: this.detectSpeaker(data.text),
                provider: 'whisper',
                language: data.language
            });
        });
        
        // Whisper transcription events
        this.socket.on('whisper-transcription', (data) => {
            this.log(`🤖 Whisper: "${data.text}"`, 'success');
            
            const transcriptionData = {
                text: data.text,
                confidence: data.confidence || 0.9, // Whisper usually has high confidence
                timestamp: new Date().toISOString(),
                isFinal: true,
                speaker: this.detectSpeaker(data.text),
                provider: 'whisper'
            };
            
            this.addTranscription(transcriptionData);
        });
        
        this.socket.on('whisper-error', (data) => {
            this.log(`❌ Whisper error: ${data.error}`, 'error');
            
            // Fallback to Web Speech API on error
            if (!this.recognition) {
                this.initializeSpeechRecognition();
            }
            
            if (this.recognition && !this.isRecording) {
                try {
                    this.recognition.start();
                    this.isRecording = true;
                    this.log('🔄 Falling back to Web Speech API due to Whisper error', 'warning');
                } catch (error) {
                    this.log(`Failed to start fallback recognition: ${error.message}`, 'error');
                }
            }
        });
        
        // Legacy Web Speech API events (fallback)
        this.socket.on('new-transcription', (data) => {
            if (data.provider === 'web-speech-api') {
                this.log(`📱 Fallback transcription from ${data.socketId}`, 'info');
                this.addTranscription(data);
            }
        });
        
        this.socket.on('screen-share-started', (data) => {
            this.log(`User ${data.socketId} started screen sharing`, 'info');
        });
        
        this.socket.on('screen-share-stopped', (data) => {
            this.log(`User ${data.socketId} stopped screen sharing`, 'info');
        });
    }
    
    initializeSpeechRecognition() {
        // Fallback Web Speech API (only used if Whisper fails)
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.log('Speech recognition not supported in this browser', 'warning');
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // ULTRA RESPONSIVE SETTINGS for real-time experience
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'id-ID';
        this.recognition.maxAlternatives = 1; // Focus on single best result
        
        // Aggressive settings for instant capture
        this.currentInterimText = '';
        this.interimTimeout = null;
        
        this.recognition.onresult = (event) => {
            // Only use if Whisper is not available
            if (this.useWhisper && this.whisperReady) return;
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const confidence = event.results[i][0].confidence;
                
                if (event.results[i].isFinal) {
                    // Final result - commit to transcript
                    const transcriptionData = {
                        text: transcript.trim(),
                        confidence: confidence || 0,
                        timestamp: new Date().toISOString(),
                        isFinal: true,
                        speaker: this.detectSpeaker(transcript),
                        provider: 'web-speech-api'
                    };
                    
                    // Clear interim display and add final result
                    this.clearInterimDisplay();
                    this.addTranscription(transcriptionData);
                    
                    // Send to server
                    this.socket.emit('transcription', transcriptionData);
                    
                    this.log(`🎤 FINAL: "${transcript.trim()}"`, 'success');
                } else {
                    // Interim result - show live typing animation
                    if (transcript.trim().length > 1) {
                        this.showInterimTranscription(transcript.trim());
                        this.log(`⚡ LIVE: "${transcript.trim()}"`, 'info');
                    }
                }
            }
        };
        
        this.recognition.onerror = (event) => {
            this.log(`Speech recognition error: ${event.error}`, 'error');
        };
    }
    
    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startScreenShare());
        this.stopBtn.addEventListener('click', () => this.stopScreenShare());
        this.toggleAudioBtn.addEventListener('click', () => this.toggleAudioSource());
        this.clearTranscriptBtn.addEventListener('click', () => this.clearTranscriptions());
        this.downloadBtn.addEventListener('click', () => this.downloadTranscript());
        this.clearLogsBtn.addEventListener('click', () => this.clearLogs());
    }
    
    async startScreenShare() {
        try {
            this.log('Requesting screen share permission...', 'info');
            
            // Request screen capture dengan audio
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 2
                }
            });
            
            this.log('✅ Screen share with audio granted', 'success');
            
            // Set video preview
            this.previewVideo.srcObject = this.mediaStream;
            
            // Debug audio tracks
            const audioTracks = this.mediaStream.getAudioTracks();
            const videoTracks = this.mediaStream.getVideoTracks();
            
            this.log(`🎥 Video tracks: ${videoTracks.length}`, 'info');
            this.log(`🎵 Audio tracks: ${audioTracks.length}`, 'info');
            
            audioTracks.forEach((track, index) => {
                this.log(`Audio Track ${index}:`, 'info');
                this.log(`  - Label: ${track.label}`, 'info');
                this.log(`  - Kind: ${track.kind}`, 'info');
                this.log(`  - Enabled: ${track.enabled}`, 'info');
            });
            
            // Check audio source
            if (audioTracks.length > 0) {
                const trackLabel = audioTracks[0].label.toLowerCase();
                if (trackLabel.includes('microphone') || trackLabel.includes('mic')) {
                    this.log('⚠️ WARNING: Using microphone, not system audio!', 'warning');
                    this.updateStatus('🎤 Microphone Audio', true);
                } else if (trackLabel.includes('tab')) {
                    this.log('⚠️ Tab audio captured - but Web Speech API uses microphone!', 'warning');
                    this.log('💡 Remove earphone to hear screen audio through speakers', 'info');
                    this.updateStatus('📺 Tab Audio (Speech API uses mic)', true);
                } else {
                    this.log('✅ System audio captured', 'success');
                    this.updateStatus('🔊 System Audio', true);
                }
            }
            
            // Start recording
            this.startRecording();
            
            // Update UI
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.toggleAudioBtn.disabled = false;
            
            // Notify server
            this.socket.emit('start-screen-share', {
                timestamp: new Date().toISOString(),
                hasAudio: audioTracks.length > 0,
                hasVideo: videoTracks.length > 0
            });
            
            // Handle stream ending
            this.mediaStream.getVideoTracks()[0].onended = () => {
                this.log('Screen share ended by user', 'warning');
                this.stopScreenShare();
            };
            
        } catch (error) {
            this.log(`Failed to start screen share: ${error.message}`, 'error');
            this.updateStatus('Failed to start screen sharing', false);
        }
    }
    
    async startRecording() {
        if (!this.mediaStream) {
            this.log('No media stream available for recording', 'error');
            return;
        }
        
        // Initialize Whisper client first
        this.whisperClient = new WhisperClient();
        this.whisperReady = await this.whisperClient.checkServerHealth();
        
        if (this.whisperReady) {
            this.log('🤖 Whisper server is ready - using Whisper API', 'success');
            this.useWhisper = true;
            
            // Setup MediaRecorder for Whisper
            this.setupMediaRecorderForWhisper(this.mediaStream);
            
            // Start continuous audio streaming to Whisper
            this.startWhisperTranscription();
        } else {
            this.log('⚠️ Whisper server not available - falling back to Web Speech API', 'warning');
            this.useWhisper = false;
            
            // Initialize Web Speech API as fallback
            this.initializeSpeechRecognition();
            
            // Start Web Speech API
            if (this.recognition) {
                try {
                    this.recognition.start();
                    this.isRecording = true;
                    this.log('🎤 Web Speech API started as fallback', 'info');
                } catch (error) {
                    this.log(`Failed to start Web Speech API: ${error.message}`, 'error');
                }
            }
        }
        
        // Initialize audio analysis for music detection (common for both methods)
        this.initializeAudioAnalysis();
        
        // Check if we have audio tracks
        const audioTracks = this.mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            this.log('No audio tracks found in screen share', 'warning');
            return;
        }
        
        this.log(`Found ${audioTracks.length} audio track(s)`, 'success');
        this.isRecording = true;
    }
    
    async toggleAudioSource() {
        if (!this.mediaStream) return;
        
        try {
            const currentAudioTracks = this.mediaStream.getAudioTracks();
            const currentLabel = currentAudioTracks[0]?.label || '';
            
            // Remove current audio tracks
            currentAudioTracks.forEach(track => {
                track.stop();
                this.mediaStream.removeTrack(track);
            });
            
            let newAudioStream;
            let newLabel;
            
            if (currentLabel.toLowerCase().includes('microphone') || currentLabel.toLowerCase().includes('mic')) {
                // Switch from mic to system audio (try screen share audio again)
                this.log('🔄 Switching to system audio...', 'info');
                try {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: false,
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            sampleRate: 48000
                        }
                    });
                    newAudioStream = screenStream;
                    newLabel = '🖥️ System Audio';
                    this.toggleAudioBtn.textContent = '🎤 Switch to Microphone';
                } catch (error) {
                    throw new Error('System audio not available');
                }
            } else {
                // Switch from system to microphone
                this.log('🔄 Switching to microphone...', 'info');
                newAudioStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        sampleRate: 48000
                    }
                });
                newLabel = '🎤 Microphone';
                this.toggleAudioBtn.textContent = '🖥️ Switch to System Audio';
            }
            
            // Add new audio tracks
            newAudioStream.getAudioTracks().forEach(track => {
                this.mediaStream.addTrack(track);
            });
            
            this.log(`✅ Switched to: ${newLabel}`, 'success');
            this.updateStatus(`Active with ${newLabel}`, true);
            
        } catch (error) {
            this.log(`❌ Failed to switch audio source: ${error.message}`, 'error');
        }
    }
    
    stopScreenShare() {
        try {
            // Stop audio analysis
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            
            // Stop Whisper transcription if active
            if (this.useWhisper && this.mediaRecorder) {
                this.stopWhisperTranscription();
            }
            
            // Stop speech recognition (fallback)
            if (this.recognition && this.isRecording) {
                this.recognition.stop();
                this.isRecording = false;
                this.log('Speech recognition stopped', 'info');
            }
            
            // Stop all tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                    this.log(`Stopped ${track.kind} track`, 'info');
                });
                this.mediaStream = null;
            }
            
            // Clear video
            this.previewVideo.srcObject = null;
            
            // Reset Whisper state
            this.useWhisper = false;
            this.whisperReady = false;
            this.audioChunks = [];
            this.mediaRecorder = null;
            
            // Update UI
            this.updateStatus('Screen sharing stopped', false);
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.toggleAudioBtn.disabled = true;
            
            this.log('Screen share stopped successfully', 'success');
            
        } catch (error) {
            this.log(`Error stopping screen share: ${error.message}`, 'error');
        }
    }
    
    initializeAudioAnalysis() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Setup analyser untuk detect musik patterns
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            
            // Connect audio stream ke analyser
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            source.connect(this.analyser);
            
            // Start monitoring audio patterns
            this.startAudioMonitoring();
            
            this.log('🎵 Audio analysis initialized for music detection', 'success');
        } catch (error) {
            this.log(`Failed to initialize audio analysis: ${error.message}`, 'error');
        }
    }
    
    startAudioMonitoring() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const monitor = () => {
            if (!this.isRecording) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Analyze frequency distribution untuk detect musik vs speech
            const avgFrequency = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
            const highFreqCount = dataArray.slice(bufferLength * 0.6).filter(v => v > 100).length;
            const lowFreqCount = dataArray.slice(0, bufferLength * 0.3).filter(v => v > 100).length;
            
            // Music typically has more consistent frequency distribution
            const musicScore = (highFreqCount + lowFreqCount) / bufferLength;
            
            this.audioLevelHistory.push({
                avgFreq: avgFrequency,
                musicScore: musicScore,
                timestamp: Date.now()
            });
            
            // Keep only last 10 samples
            if (this.audioLevelHistory.length > 10) {
                this.audioLevelHistory.shift();
            }
            
            // Check if current audio seems like music
            const isMusicLikely = this.detectMusic();
            if (isMusicLikely) {
                this.log('🎵 Music detected - suppressing transcription', 'warning');
                this.suppressTranscription = true;
            } else {
                this.suppressTranscription = false;
            }
            
            requestAnimationFrame(monitor);
        };
        
        monitor();
    }
    
    detectMusic() {
        if (this.audioLevelHistory.length < 5) return false;
        
        const recent = this.audioLevelHistory.slice(-5);
        const avgMusicScore = recent.reduce((sum, sample) => sum + sample.musicScore, 0) / recent.length;
        const avgFrequency = recent.reduce((sum, sample) => sum + sample.avgFreq, 0) / recent.length;
        
        // Heuristic: musik biasanya punya frequency distribution yang lebih konsisten
        // dan level yang lebih tinggi daripada speech
        return avgMusicScore > this.musicThreshold && avgFrequency > 50;
    }
    
    isLikelyMusic(text) {
        // Common patterns yang biasanya dari musik/lagu
        const musicPatterns = [
            /^(la|na|da|ya|oh|ah|mm|hm)+$/i,  // Nonsense syllables
            /^[a-z\s]{1,3}$/i,                // Very short random chars
            /\b(yeah|oh|ah|na|la)\b.*\b(yeah|oh|ah|na|la)\b/i, // Repeated musical expressions
            /^[\s\-\.\,]*$/,                  // Only punctuation/spaces
        ];
        
        const lowerText = text.toLowerCase().trim();
        
        // Check patterns
        for (const pattern of musicPatterns) {
            if (pattern.test(lowerText)) {
                return true;
            }
        }
        
        // Check for very repetitive text (common in music)
        const words = lowerText.split(/\s+/);
        if (words.length > 2) {
            const uniqueWords = new Set(words);
            const repetitionRatio = uniqueWords.size / words.length;
            if (repetitionRatio < 0.5) { // More than 50% repetition
                return true;
            }
        }
        
        return false;
    }
    
    detectSpeaker(text) {
        // Simple heuristic untuk detect interviewer vs interviewee
        const questionWords = ['apa', 'bagaimana', 'mengapa', 'kenapa', 'siapa', 'dimana', 'kapan', 
                              'what', 'how', 'why', 'who', 'where', 'when', 'can you', 'could you',
                              'tell me', 'explain', 'describe', 'ceritakan', 'jelaskan'];
        
        const lowerText = text.toLowerCase();
        const hasQuestionMark = text.includes('?');
        const hasQuestionWord = questionWords.some(word => lowerText.includes(word));
        
        if (hasQuestionMark || hasQuestionWord) {
            return 'INTERVIEWER';
        }
        return 'SPEAKER';
    }
    
    showInterimResult(text) {
        // Remove any existing interim result
        const existingInterim = document.getElementById('interim-result');
        if (existingInterim) {
            existingInterim.remove();
        }
        
        // Create new interim result element
        const interimItem = document.createElement('div');
        interimItem.id = 'interim-result';
        interimItem.className = 'transcription-item interim';
        interimItem.style.opacity = '0.7';
        interimItem.style.borderLeft = '4px solid #ffc107';
        interimItem.style.fontStyle = 'italic';
        
        const meta = document.createElement('div');
        meta.className = 'transcription-meta';
        meta.textContent = `${new Date().toLocaleTimeString()} - 🔴 LIVE CAPTURE`;
        
        const text_div = document.createElement('div');
        text_div.className = 'transcription-text';
        text_div.textContent = text;
        
        const confidence = document.createElement('div');
        confidence.className = 'confidence';
        confidence.textContent = '⚡ Capturing live audio...';
        confidence.style.color = '#dc3545'; // Red for urgency
        
        interimItem.appendChild(meta);
        interimItem.appendChild(text_div);
        interimItem.appendChild(confidence);
        
        // Remove placeholder if exists
        if (this.transcriptionArea.children.length === 1 && 
            this.transcriptionArea.children[0].tagName === 'P') {
            this.transcriptionArea.innerHTML = '';
        }
        
        this.transcriptionArea.appendChild(interimItem);
        this.transcriptionArea.scrollTop = this.transcriptionArea.scrollHeight;
    }
    
    addTranscription(data) {
        // Check if transcriptArea exists
        if (!this.transcriptArea) {
            this.log('⚠️ Transcript area not found, reinitializing...', 'warning');
            this.transcriptArea = document.getElementById('transcriptionArea');
            if (!this.transcriptArea) {
                this.log('❌ Failed to find transcript area element', 'error');
                return;
            }
        }
        
        // Remove interim result when final comes in
        this.clearInterimDisplay();
        
        this.transcriptions.push(data);
        
        // Create transcript entry with new styling
        const transcriptEntry = document.createElement('div');
        transcriptEntry.className = 'transcript-entry';
        
        // Add special styling for interviewer
        if (data.speaker === 'INTERVIEWER') {
            transcriptEntry.style.borderLeft = '4px solid #dc3545';
            transcriptEntry.style.backgroundColor = '#fff5f5';
        }
        
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const speakerLabel = data.speaker === 'INTERVIEWER' ? '❓ INTERVIEWER' : '💬 SPEAKER';
        const providerLabel = data.provider === 'web-speech-api' ? '📱 WebSpeech' : 
                            data.provider === 'whisper' ? '🤖 Whisper' : '🎯 Other';
        
        transcriptEntry.innerHTML = `
            <div class="transcript-header">
                <span class="transcript-time">${timestamp}</span>
                <span class="transcript-speaker" style="background: ${data.speaker === 'INTERVIEWER' ? '#dc3545' : '#007bff'}">${speakerLabel}</span>
                <span class="transcript-provider">${providerLabel} (${(data.confidence * 100).toFixed(1)}%)</span>
            </div>
            <div class="transcript-text ${data.speaker === 'INTERVIEWER' ? 'interviewer-text' : ''}">${data.text}</div>
        `;
        
        // Remove placeholder if exists
        if (this.transcriptionArea.children.length === 1 && 
            this.transcriptionArea.children[0].tagName === 'P') {
            this.transcriptionArea.innerHTML = '';
        }
        
        // Add with fade-in animation
        transcriptEntry.style.opacity = '0';
        transcriptEntry.style.transform = 'translateY(10px)';
        this.transcriptionArea.appendChild(transcriptEntry);
        
        // Animate in
        setTimeout(() => {
            transcriptEntry.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            transcriptEntry.style.opacity = '1';
            transcriptEntry.style.transform = 'translateY(0)';
        }, 10);
        
        this.transcriptionArea.scrollTop = this.transcriptionArea.scrollHeight;
    }
    
    clearTranscriptions() {
        this.transcriptions = [];
        
        this.transcriptionArea.innerHTML = `
            <p style="text-align: center; color: #6c757d; font-style: italic;">
                🎤 <strong>Web Speech API Ready</strong> - Interview mode enabled<br>
                <small style="color: #dc3545;">❓ Red highlights = Interviewer questions</small><br>
                <small>💬 Regular = Speaker responses</small><br>
                <small style="color: #ffc107;">⚠️ Note: Web Speech API uses microphone input only</small>
            </p>
        `;
        this.log('Transcriptions cleared', 'info');
    }
    
    downloadTranscript() {
        if (this.transcriptions.length === 0) {
            this.log('No transcriptions to download', 'warning');
            return;
        }
        
        const content = this.transcriptions.map(t => 
            `[${new Date(t.timestamp).toLocaleString()}] [${t.speaker}] ${t.text} (${(t.confidence * 100).toFixed(1)}%)`
        ).join('\n');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.log('Transcript downloaded', 'success');
    }
    
    updateStatus(message, isActive) {
        this.statusDiv.textContent = `Status: ${message}`;
        
        if (this.suppressTranscription) {
            this.statusDiv.className = 'status music-detected';
            this.statusDiv.textContent = 'Status: 🎵 Music Detected - Transcription Paused';
        } else {
            this.statusDiv.className = `status ${isActive ? 'active' : 'inactive'}`;
        }
    }

    setupMediaRecorderForWhisper(stream) {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            this.log('No audio tracks available for Whisper', 'warning');
            return;
        }

        // Create audio-only stream for Whisper
        const audioStream = new MediaStream(audioTracks);
        
        this.mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 16000
        });

        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
                
                // Send audio chunk to server for Whisper processing
                if (this.socket) {
                    event.data.arrayBuffer().then(buffer => {
                        this.socket.emit('audio-data', {
                            audio: Array.from(new Uint8Array(buffer)),
                            timestamp: Date.now()
                        });
                    });
                }
            }
        };

        this.mediaRecorder.onerror = (event) => {
            this.log(`MediaRecorder error: ${event.error}`, 'error');
        };

        this.log('MediaRecorder setup complete for Whisper', 'success');
    }

    startWhisperTranscription() {
        if (!this.mediaRecorder) {
            this.log('MediaRecorder not setup for Whisper', 'error');
            return;
        }

        try {
            // Start recording in small chunks for real-time processing
            this.mediaRecorder.start(1000); // 1 second chunks
            this.isRecording = true;
            this.log('🎤 Whisper transcription started', 'success');
        } catch (error) {
            this.log(`Failed to start Whisper transcription: ${error.message}`, 'error');
        }
    }

    stopWhisperTranscription() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.log('🛑 Whisper transcription stopped', 'info');
        }
    }

    showInterimTranscription(text) {
        // Check if transcriptArea exists
        if (!this.transcriptArea) {
            this.log('⚠️ Transcript area not found, reinitializing...', 'warning');
            this.transcriptArea = document.getElementById('transcriptionArea');
            if (!this.transcriptArea) {
                this.log('❌ Failed to find transcript area element', 'error');
                return;
            }
        }
        
        // Remove existing interim display
        this.clearInterimDisplay();
        
        // Create interim display element
        const interimDiv = document.createElement('div');
        interimDiv.className = 'transcript-entry interim-transcript';
        interimDiv.id = 'interim-display';
        
        const timestamp = new Date().toLocaleTimeString();
        interimDiv.innerHTML = `
            <div class="transcript-header">
                <span class="transcript-time">${timestamp}</span>
                <span class="transcript-speaker">🎤 LIVE</span>
                <span class="transcript-provider">typing...</span>
            </div>
            <div class="transcript-text typing-animation">${text}</div>
        `;
        
        // Add to transcript area
        this.transcriptArea.appendChild(interimDiv);
        this.transcriptArea.scrollTop = this.transcriptArea.scrollHeight;
        
        // Add typing animation class
        setTimeout(() => {
            const textElement = interimDiv.querySelector('.transcript-text');
            if (textElement) {
                textElement.classList.add('typing-active');
            }
        }, 50);
    }

    clearInterimDisplay() {
        const existingInterim = document.getElementById('interim-display');
        if (existingInterim) {
            existingInterim.remove();
        }
    }
    
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;
        logEntry.textContent = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        
        this.logsArea.appendChild(logEntry);
        this.logsArea.scrollTop = this.logsArea.scrollHeight;
        
        // Keep only last 100 log entries
        while (this.logsArea.children.length > 100) {
            this.logsArea.removeChild(this.logsArea.firstChild);
        }
        
        // Also log to console
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
    
    clearLogs() {
        this.logsArea.innerHTML = '<div class="log-entry log-info">[INFO] Logs cleared</div>';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.screenAudioApp = new ScreenAudioToText();
});
