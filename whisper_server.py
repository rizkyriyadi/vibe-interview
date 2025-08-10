#!/usr/bin/env python3
"""
Whisper API Server using faster-whisper
Compatible with OpenAI Whisper API format
Optimized for real-time Indonesian transcription
"""

import os
import tempfile
import time
from typing import Optional
from flask import Flask, request, jsonify
from flask_cors import CORS
from faster_whisper import WhisperModel
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Enable CORS with specific configuration for localhost:3000
CORS(app, origins=["http://localhost:3000"], methods=["GET", "POST", "OPTIONS"])

# Global Whisper model
whisper_model = None

def initialize_whisper():
    """Initialize Whisper model with optimal settings for Indonesian"""
    global whisper_model
    try:
        logger.info("🎤 Initializing Whisper model...")
        
        # Use small model for speed, can be changed to medium/large for accuracy
        model_size = "small"  # Options: tiny, base, small, medium, large-v2, large-v3
        
        # Initialize with optimal settings
        whisper_model = WhisperModel(
            model_size, 
            device="cpu",  # Use CPU for better compatibility, change to "cuda" if you have GPU
            compute_type="int8"  # Quantized for faster inference
        )
        
        logger.info(f"✅ Whisper model '{model_size}' loaded successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize Whisper: {e}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "model_loaded": whisper_model is not None,
        "timestamp": time.time()
    })

@app.route('/v1/audio/transcriptions', methods=['POST'])
def transcribe_audio():
    """
    OpenAI-compatible transcription endpoint
    Accepts audio file and returns transcription
    """
    try:
        if whisper_model is None:
            return jsonify({"error": "Whisper model not loaded"}), 500
            
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
            
        audio_file = request.files['file']
        if audio_file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Get optional parameters
        language = request.form.get('language', 'id')  # Default to Indonesian
        model = request.form.get('model', 'whisper-1')  # Compatibility with OpenAI API
        response_format = request.form.get('response_format', 'json')
        temperature = float(request.form.get('temperature', 0))
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            audio_file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            logger.info(f"🎵 Transcribing audio file: {audio_file.filename}")
            start_time = time.time()
            
            # Transcribe with Whisper
            segments, info = whisper_model.transcribe(
                temp_path,
                language=language if language != 'auto' else None,
                beam_size=1,  # Faster inference
                temperature=temperature,
                condition_on_previous_text=False,  # Better for real-time
                vad_filter=True,  # Voice Activity Detection
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Collect all segments
            full_text = ""
            segments_list = []
            
            for segment in segments:
                full_text += segment.text
                segments_list.append({
                    "id": len(segments_list),
                    "seek": segment.seek,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "tokens": segment.tokens,
                    "temperature": segment.temperature,
                    "avg_logprob": segment.avg_logprob,
                    "compression_ratio": segment.compression_ratio,
                    "no_speech_prob": segment.no_speech_prob
                })
            
            duration = time.time() - start_time
            logger.info(f"✅ Transcription completed in {duration:.2f}s: '{full_text.strip()[:100]}...'")
            
            # Format response like OpenAI API
            response = {
                "text": full_text.strip(),
                "language": info.language,
                "duration": info.duration,
                "segments": segments_list if response_format == 'verbose_json' else None
            }
            
            # Remove None values
            response = {k: v for k, v in response.items() if v is not None}
            
            return jsonify(response)
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass
                
    except Exception as e:
        logger.error(f"❌ Transcription error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/v1/audio/translations', methods=['POST'])
def translate_audio():
    """
    OpenAI-compatible translation endpoint
    Translates audio to English
    """
    try:
        if whisper_model is None:
            return jsonify({"error": "Whisper model not loaded"}), 500
            
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400
            
        audio_file = request.files['file']
        if audio_file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Get optional parameters
        model = request.form.get('model', 'whisper-1')
        response_format = request.form.get('response_format', 'json')
        temperature = float(request.form.get('temperature', 0))
        
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            audio_file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            logger.info(f"🌍 Translating audio file: {audio_file.filename}")
            start_time = time.time()
            
            # Transcribe and translate to English
            segments, info = whisper_model.transcribe(
                temp_path,
                task="translate",  # Translate to English
                beam_size=1,
                temperature=temperature,
                condition_on_previous_text=False,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=500)
            )
            
            # Collect all segments
            full_text = ""
            segments_list = []
            
            for segment in segments:
                full_text += segment.text
                segments_list.append({
                    "id": len(segments_list),
                    "seek": segment.seek,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "tokens": segment.tokens,
                    "temperature": segment.temperature,
                    "avg_logprob": segment.avg_logprob,
                    "compression_ratio": segment.compression_ratio,
                    "no_speech_prob": segment.no_speech_prob
                })
            
            duration = time.time() - start_time
            logger.info(f"✅ Translation completed in {duration:.2f}s: '{full_text.strip()[:100]}...'")
            
            # Format response like OpenAI API
            response = {
                "text": full_text.strip(),
                "language": "en",  # Always English for translation
                "duration": info.duration,
                "segments": segments_list if response_format == 'verbose_json' else None
            }
            
            # Remove None values
            response = {k: v for k, v in response.items() if v is not None}
            
            return jsonify(response)
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass
                
    except Exception as e:
        logger.error(f"❌ Translation error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/', methods=['GET'])
def index():
    """Index page with API documentation"""
    return jsonify({
        "name": "Whisper API Server",
        "version": "1.0.0",
        "description": "OpenAI-compatible Whisper API using faster-whisper",
        "model_loaded": whisper_model is not None,
        "endpoints": {
            "/health": "Health check",
            "/v1/audio/transcriptions": "Transcribe audio to text",
            "/v1/audio/translations": "Translate audio to English"
        },
        "supported_languages": [
            "id (Indonesian)", "en (English)", "auto (auto-detect)"
        ]
    })

if __name__ == '__main__':
    # Initialize Whisper model
    if not initialize_whisper():
        logger.error("Failed to initialize Whisper model. Exiting.")
        exit(1)
    
    # Start Flask server
    logger.info("🚀 Starting Whisper API Server on http://localhost:5001")
    app.run(
        host='0.0.0.0',
        port=5001,
        debug=False,
        threaded=True
    )
