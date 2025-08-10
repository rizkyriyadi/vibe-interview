class ScreenAudioToText {
    constructor() {
        this.socket = io();
        this.mediaStream = null;
        this.recognition = null;
        this.isRecording = false;
        this.transcriptions = [];
        
        // Audio analysis for music detection
        this.audioContext = null;
        this.analyser = null;
        this.audioLevelHistory = [];
        this.musicThreshold = 0.7;
        this.suppressTranscription = false;
        
        this.initializeElements();
        this.initializeSocketEvents();
        this.initializeSpeechRecognition();
        this.bindEvents();
        
        this.log('🚀 Application initialized - Web Speech API mode', 'info');
    }
    
    initializeElements() {
        // Buttons
        this.startBtn = document.getElementById('startShareBtn');
        this.stopBtn = document.getElementById('stopShareBtn');
        this.toggleAudioBtn = document.getElementById('toggleAudioBtn');
        this.clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.clearLogsBtn = document.getElementById('clearLogsBtn');
        
        // Display areas
        this.statusDiv = document.getElementById('status');
        this.transcriptionArea = document.getElementById('transcriptionArea');
        this.logsArea = document.getElementById('logsArea');
        this.previewVideo = document.getElementById('previewVideo');
    }
    
    initializeSocketEvents() {
        this.socket.on('connect', () => {
            this.log(`Connected to server with ID: ${this.socket.id}`, 'success');
        });
        
        this.socket.on('disconnect', () => {
            this.log('Disconnected from server', 'warning');
        });
        
        this.socket.on('new-transcription', (data) => {
            this.log(`📱 New transcription from ${data.socketId}`, 'info');
            this.addTranscription(data);
        });
        
        this.socket.on('screen-share-started', (data) => {
            this.log(`User ${data.socketId} started screen sharing`, 'info');
        });
        
        this.socket.on('screen-share-stopped', (data) => {
            this.log(`User ${data.socketId} stopped screen sharing`, 'info');
        });
    }
    
    initializeSpeechRecognition() {
        // Check for browser support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            this.log('Speech recognition not supported in this browser', 'error');
            return;
        }
        
        // Initialize Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Configure recognition untuk MAXIMUM AGGRESSIVENESS (Interview mode)
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'id-ID'; // Indonesian, bisa diganti ke 'en-US' untuk English
        this.recognition.maxAlternatives = 3; // Ambil 3 alternatif untuk akurasi lebih baik
        
        // AGGRESSIVE SETTINGS untuk interview
        // Tidak ada pause detection - langsung capture semua
        this.interviewMode = true;
        
        this.recognition.onstart = () => {
            this.log('🎤 Speech recognition started', 'success');
        };
        
        this.recognition.onresult = (event) => {
            // Check if music is detected - suppress transcription if so
            if (this.suppressTranscription) {
                this.log('🚫 Transcription suppressed due to music detection', 'warning');
                return;
            }
            
            // INTERVIEW MODE: Capture everything aggressively (only for speech)
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const confidence = event.results[i][0].confidence;
                
                // Additional filter: ignore very low confidence (likely music/noise)
                if (confidence && confidence < 0.5) {
                    this.log(`🚫 Low confidence ignored: "${transcript}" (${(confidence * 100).toFixed(1)}%)`, 'warning');
                    continue;
                }
                
                if (event.results[i].isFinal) {
                    // Additional check: filter out music-like patterns
                    if (this.isLikelyMusic(transcript)) {
                        this.log(`🎵 Music-like transcript ignored: "${transcript}"`, 'warning');
                        continue;
                    }
                    
                    // IMMEDIATE CAPTURE - no waiting for pauses
                    const transcriptionData = {
                        text: transcript.trim(),
                        confidence: confidence || 0,
                        timestamp: new Date().toISOString(),
                        isFinal: true,
                        speaker: this.detectSpeaker(transcript),
                        provider: 'web-speech-api'
                    };
                    
                    // Send to server immediately
                    this.socket.emit('transcription', transcriptionData);
                    
                    // Add to UI immediately - no sentence building delay
                    this.addTranscription(transcriptionData);
                    
                    this.log(`🎤 CAPTURED: "${transcript.trim()}" (${(confidence * 100).toFixed(1)}%)`, 'success');
                } else {
                    // Show interim aggressively for live feedback (only if not music)
                    if (transcript.trim().length > 2 && !this.isLikelyMusic(transcript)) {
                        this.log(`⚡ Live: "${transcript.trim()}"`, 'info');
                        this.showInterimResult(transcript.trim());
                    }
                }
            }
        };
        
        this.recognition.onerror = (event) => {
            this.log(`Speech recognition error: ${event.error}`, 'error');
        };
        
        this.recognition.onend = () => {
            this.log('🛑 Speech recognition ended - AGGRESSIVE RESTART', 'warning');
            // IMMEDIATE restart for interview mode - no delays
            if (this.isRecording) {
                setTimeout(() => {
                    try {
                        this.recognition.start();
                        this.log('🔄 Recognition restarted for continuous capture', 'info');
                    } catch (error) {
                        this.log(`Failed to restart recognition: ${error.message}`, 'error');
                        // Try again after short delay
                        setTimeout(() => {
                            try {
                                this.recognition.start();
                            } catch (e) {
                                this.log(`Second restart attempt failed: ${e.message}`, 'error');
                            }
                        }, 200);
                    }
                }, 50); // Very short delay for immediate restart
            }
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
            
            // First try: Request screen capture dengan MAXIMUM audio quality untuk interview
            try {
                this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        mediaSource: 'screen',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: {
                        echoCancellation: false,    // Turn OFF untuk capture semua audio
                        noiseSuppression: false,    // Turn OFF untuk capture semua suara
                        autoGainControl: false,     // Turn OFF untuk volume konsisten
                        sampleRate: 48000,          // Higher sample rate
                        channelCount: 2             // Stereo untuk better capture
                    }
                });
                
                this.log('✅ Screen share with audio granted', 'success');
            } catch (audioError) {
                this.log('⚠️ Screen audio failed, trying without audio...', 'warning');
                
                // Fallback: Screen without audio
                this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        mediaSource: 'screen',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    },
                    audio: false
                });
                
                this.log('📱 Attempting to add microphone as audio source...', 'info');
                
                // Try to get microphone separately
                try {
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            sampleRate: 48000
                        }
                    });
                    
                    // Combine video from screen + audio from mic
                    const combinedStream = new MediaStream([
                        ...this.mediaStream.getVideoTracks(),
                        ...micStream.getAudioTracks()
                    ]);
                    
                    this.mediaStream = combinedStream;
                    this.log('🎤 Combined screen video + microphone audio', 'success');
                } catch (micError) {
                    this.log(`❌ Microphone access failed: ${micError.message}`, 'error');
                }
            }
            
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
                this.log(`  - Settings: ${JSON.stringify(track.getSettings())}`, 'info');
            });
            
            // Check if we actually have system audio vs microphone
            if (audioTracks.length > 0) {
                const trackLabel = audioTracks[0].label.toLowerCase();
                if (trackLabel.includes('microphone') || trackLabel.includes('mic')) {
                    this.log('⚠️  WARNING: Capturing from MICROPHONE, not system audio!', 'warning');
                    this.updateStatus('⚠️ Using Microphone (not system audio)', true);
                } else if (trackLabel.includes('tab')) {
                    this.log('✅ Capturing tab audio - but Speech API still uses mic!', 'warning');
                    this.log('💡 SOLUTION: Remove earphone to hear screen audio through speakers', 'info');
                    this.updateStatus('📺 Tab Audio Captured (Speech API uses mic)', true);
                } else {
                    this.log('✅ Capturing system audio', 'success');
                }
            }
            
            // Start recording
            this.startRecording();
            
            // Update UI
            this.updateStatus('Screen sharing active', true);
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.toggleAudioBtn.disabled = false;
            
            // Notify server
            this.socket.emit('start-screen-share', {
                timestamp: new Date().toISOString(),
                hasAudio: this.mediaStream.getAudioTracks().length > 0,
                hasVideo: this.mediaStream.getVideoTracks().length > 0
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
    
    startRecording() {
        if (!this.mediaStream) {
            this.log('No media stream available for recording', 'error');
            return;
        }
        
        // Initialize audio analysis untuk music detection
        this.initializeAudioAnalysis();
        
        // Check if we have audio tracks
        const audioTracks = this.mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            this.log('No audio tracks found in screen share', 'warning');
            return;
        }
        
        this.log(`Found ${audioTracks.length} audio track(s)`, 'success');
        
        // Setup MediaRecorder for sending audio to Deepgram
        try {
            // Try multiple MIME types for better compatibility
            let options;
            const supportedTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4',
                'audio/ogg;codecs=opus',
                ''  // Default
            ];
            
            for (const mimeType of supportedTypes) {
                if (mimeType === '' || MediaRecorder.isTypeSupported(mimeType)) {
                    options = mimeType ? { 
                        mimeType: mimeType,
                        audioBitsPerSecond: 16000 
                    } : { audioBitsPerSecond: 16000 };
                    
                    this.log(`✅ Using MIME type: ${mimeType || 'default'}`, 'success');
                    break;
                }
            }
            
            this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.log(`🎵 Audio chunk: ${event.data.size} bytes (Deepgram ready: ${this.deepgramReady})`, 'info');
                    
                    if (this.deepgramReady) {
                        // Send audio data to Deepgram via WebSocket
                        this.socket.emit('audio-data', event.data);
                        this.log(`📤 Sent to Deepgram: ${event.data.size} bytes`, 'success');
                    } else {
                        this.log(`⏳ Waiting for Deepgram connection...`, 'warning');
                    }
                }
            };
            
            this.mediaRecorder.onstart = () => {
                this.log('🎙️ MediaRecorder started successfully', 'success');
            };
            
            this.mediaRecorder.onerror = (error) => {
                this.log(`❌ MediaRecorder error: ${JSON.stringify(error)}`, 'error');
            };
            
            this.mediaRecorder.onstop = () => {
                this.log('🛑 MediaRecorder stopped', 'info');
            };
            
            // Start recording with short intervals for real-time processing
            this.mediaRecorder.start(250); // 250ms chunks for near real-time
            
            // Notify server to start Deepgram connection
            this.socket.emit('start-deepgram');
            this.log('📡 Requested Deepgram connection from server', 'info');
            
        } catch (error) {
            this.log(`❌ Failed to start MediaRecorder: ${error.message}`, 'error');
            this.log(`🔧 Trying fallback approach...`, 'warning');
            
            // Fallback: try with minimal options
            try {
                this.mediaRecorder = new MediaRecorder(this.mediaStream);
                this.mediaRecorder.start(500); // Longer chunks as fallback
                this.log('✅ MediaRecorder started with default settings', 'success');
            } catch (fallbackError) {
                this.log(`❌ Fallback also failed: ${fallbackError.message}`, 'error');
            }
        }
        
        // Set recording state
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
            
            // Stop speech recognition
            if (this.recognition && this.isRecording) {
                this.recognition.stop();
                this.isRecording = false;
                this.log('Speech recognition stopped', 'info');
            }
            
            // Stop media recorder
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
                this.log('MediaRecorder stopped', 'info');
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
    
    finalizeSentence() {
        if (this.currentSentence.trim().length === 0) {
            return; // Nothing to finalize
        }
        
        // Create final sentence transcription
        const sentenceData = {
            text: this.currentSentence.trim(),
            confidence: 0.95, // Aggregate confidence
            timestamp: new Date().toISOString(),
            isFinal: true,
            sentenceNumber: this.sentenceCounter
        };
        
        // Send to server
        this.socket.emit('transcription', sentenceData);
        
        // Add to UI as final result
        this.addTranscription(sentenceData);
        
        this.log(`📝 Sentence ${this.sentenceCounter} completed: "${this.currentSentence.trim()}"`, 'success');
        
        // Reset for next sentence
        this.currentSentence = '';
        this.sentenceCounter++;
        
        // Remove interim display
        const existingInterim = document.getElementById('interim-result');
        if (existingInterim) {
            existingInterim.remove();
        }
    }
    
    showCurrentSentence() {
        // Show current accumulated sentence as interim while building
        if (this.currentSentence.trim().length > 0) {
            this.showInterimResult(this.currentSentence.trim());
        }
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
        // Remove interim result when final comes in
        const existingInterim = document.getElementById('interim-result');
        if (existingInterim) {
            existingInterim.remove();
        }
        
        this.transcriptions.push(data);
        
        const transcriptionItem = document.createElement('div');
        transcriptionItem.className = 'transcription-item';
        
        const meta = document.createElement('div');
        meta.className = 'transcription-meta';
        const speakerLabel = data.speaker === 'INTERVIEWER' ? '❓ INTERVIEWER' : '💬 SPEAKER';
        meta.textContent = `${new Date(data.timestamp).toLocaleTimeString()} - ${speakerLabel}`;
        
        const text = document.createElement('div');
        text.className = 'transcription-text';
        text.textContent = data.text;
        
        // Highlight interviewer questions
        if (data.speaker === 'INTERVIEWER') {
            transcriptionItem.style.borderLeft = '4px solid #dc3545'; // Red for questions
            transcriptionItem.style.backgroundColor = '#fff5f5';
            text.style.fontWeight = 'bold';
        }
        
        const confidence = document.createElement('div');
        confidence.className = 'confidence';
        confidence.textContent = `Confidence: ${(data.confidence * 100).toFixed(1)}%`;
        
        transcriptionItem.appendChild(meta);
        transcriptionItem.appendChild(text);
        transcriptionItem.appendChild(confidence);
        
        // Remove placeholder if exists
        if (this.transcriptionArea.children.length === 1 && 
            this.transcriptionArea.children[0].tagName === 'P') {
            this.transcriptionArea.innerHTML = '';
        }
        
        this.transcriptionArea.appendChild(transcriptionItem);
        this.transcriptionArea.scrollTop = this.transcriptionArea.scrollHeight;
    }
    
    clearTranscriptions() {
        this.transcriptions = [];
        this.currentSentence = '';
        this.sentenceCounter = 1;
        if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
            this.pauseTimer = null;
        }
        
        this.transcriptionArea.innerHTML = `
            <p style="text-align: center; color: #6c757d; font-style: italic;">
                🎤 <strong>INTERVIEW MODE</strong> - Aggressive audio capture enabled<br>
                <small style="color: #dc3545;">❓ Red highlights = Interviewer questions</small><br>
                <small>💬 Blue = Regular speech</small>
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
            `[${new Date(t.timestamp).toLocaleString()}] ${t.text} (${(t.confidence * 100).toFixed(1)}%)`
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
