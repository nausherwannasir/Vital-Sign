"""
Contactless Heart Rate Monitor Backend

A Flask server that provides heart rate analysis using remote photoplethysmography (rPPG).
The server processes green channel signals from webcam video to estimate heart rate.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
from scipy.signal import detrend, butter, filtfilt, welch
import os
import logging
from typing import Optional, List
from config import get_config
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get configuration based on environment
config = get_config()

# Configure logging
logging.basicConfig(
    level=config.LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="../frontend")
CORS(app, origins=config.CORS_ORIGINS)  # Enable CORS with configurable origins

# Use configuration values
MIN_SIGNAL_LENGTH = config.MIN_SIGNAL_LENGTH
DEFAULT_SAMPLING_RATE = config.SAMPLING_RATE
MIN_HR_FREQ = config.MIN_HR_FREQ
MAX_HR_FREQ = config.MAX_HR_FREQ
FILTER_ORDER = config.FILTER_ORDER
WELCH_SEGMENT_SIZE = config.WELCH_SEGMENT_SIZE

def compute_bpm(signal: List[float], fs: int = DEFAULT_SAMPLING_RATE) -> Optional[float]:
    """
    Compute heart rate (BPM) from a photoplethysmographic signal.
    
    This function implements a signal processing pipeline to extract heart rate
    from a time-series signal obtained from facial video analysis.
    
    Args:
        signal (List[float]): Array of normalized green channel values
        fs (int, optional): Sampling frequency in Hz. Defaults to 30.
    
    Returns:
        Optional[float]: Heart rate in beats per minute, or None if no valid peak found
    
    Raises:
        ValueError: If signal is too short or sampling rate is invalid
    """
    try:
        # Input validation
        if len(signal) < MIN_SIGNAL_LENGTH:
            logger.warning(f"Signal too short: {len(signal)} < {MIN_SIGNAL_LENGTH}")
            return None
            
        if fs <= 0:
            raise ValueError("Sampling frequency must be positive")
        
        # Convert to numpy array and remove DC component
        sig = np.array(signal, dtype=np.float64)
        sig = detrend(sig)
        
        # Design and apply bandpass filter (0.8-3.0 Hz for heart rate)
        nyquist = fs / 2
        low_cutoff = MIN_HR_FREQ / nyquist
        high_cutoff = MAX_HR_FREQ / nyquist
        
        # Ensure cutoff frequencies are valid
        if high_cutoff >= 1.0:
            high_cutoff = 0.99
            logger.warning("High cutoff frequency adjusted to prevent aliasing")
        
        b, a = butter(FILTER_ORDER, [low_cutoff, high_cutoff], btype='band')
        sig_filtered = filtfilt(b, a, sig)
        
        # Compute power spectral density using Welch's method
        frequencies, power_spectrum = welch(
            sig_filtered, 
            fs, 
            nperseg=min(WELCH_SEGMENT_SIZE, len(sig_filtered) // 4)
        )
        
        # Find peak in physiological frequency range
        freq_mask = np.logical_and(frequencies >= MIN_HR_FREQ, frequencies <= MAX_HR_FREQ)
        
        if not np.any(freq_mask):
            logger.warning("No frequencies in physiological range")
            return None
        
        # Get the frequency with maximum power in the valid range
        valid_frequencies = frequencies[freq_mask]
        valid_power = power_spectrum[freq_mask]
        
        if len(valid_power) == 0:
            return None
            
        peak_freq = valid_frequencies[np.argmax(valid_power)]
        bpm = float(peak_freq * 60)
        
        logger.info(f"Computed BPM: {bpm:.1f}")
        return bpm
        
    except Exception as e:
        logger.error(f"Error computing BPM: {str(e)}")
        return None

@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict heart rate from a photoplethysmographic signal.
    
    Expects JSON payload with 'signal' array containing normalized green channel values.
    Returns JSON response with BPM value or error message.
    
    Returns:
        JSON: {'bpm': float} on success, {'error': str} on failure
    """
    try:
        # Validate content type
        if not request.is_json:
            logger.warning("Non-JSON request received")
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        # Parse JSON data
        data = request.get_json()
        if data is None:
            return jsonify({'error': 'Invalid JSON payload'}), 400
        
        # Validate signal data
        signal = data.get('signal')
        if signal is None:
            return jsonify({'error': 'Missing signal field'}), 400
        
        if not isinstance(signal, list):
            return jsonify({'error': 'Signal must be an array'}), 400
        
        if len(signal) < MIN_SIGNAL_LENGTH:
            logger.info(f"Signal too short: {len(signal)} samples")
            return jsonify({
                'error': f'Signal too short. Minimum {MIN_SIGNAL_LENGTH} samples required',
                'received': len(signal)
            }), 400
        
        # Validate signal values
        try:
            signal_array = [float(x) for x in signal]
        except (ValueError, TypeError):
            return jsonify({'error': 'Signal values must be numeric'}), 400
        
        # Compute heart rate
        bpm = compute_bpm(signal_array, fs=DEFAULT_SAMPLING_RATE)
        
        if bpm is None:
            logger.info("No valid heart rate detected")
            return jsonify({'bpm': None, 'message': 'No valid heart rate detected'})
        
        # Validate physiological range
        if bpm < 40 or bpm > 200:
            logger.warning(f"BPM outside physiological range: {bpm}")
            return jsonify({
                'bpm': None, 
                'message': f'Detected BPM ({bpm:.1f}) outside physiological range'
            })
        
        return jsonify({'bpm': round(bpm, 1)})
        
    except Exception as e:
        logger.error(f"Unexpected error in predict endpoint: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """
    Health check endpoint for monitoring server status.
    
    Returns:
        JSON: Server status and configuration
    """
    return jsonify({
        'status': 'healthy',
        'version': '1.0.0',
        'config': {
            'min_signal_length': MIN_SIGNAL_LENGTH,
            'sampling_rate': DEFAULT_SAMPLING_RATE,
            'frequency_range': [MIN_HR_FREQ, MAX_HR_FREQ]
        }
    })

# Static files for classic front-end
@app.route('/', defaults={'path': 'index.html'})
@app.route('/<path:path>')
def static_proxy(path):
    """
    Serve static files from the frontend directory.
    
    Args:
        path (str): Requested file path
        
    Returns:
        Static file or 404 if not found
    """
    try:
        return send_from_directory(app.static_folder, path)
    except FileNotFoundError:
        logger.warning(f"File not found: {path}")
        return jsonify({'error': 'File not found'}), 404

# Add security headers
@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    # Allow camera access for localhost and HTTPS
    response.headers['Permissions-Policy'] = 'camera=(self)'
    return response

if __name__ == "__main__":
    logger.info("Starting Heart Rate Monitor server...")
    logger.info(f"Server will be available at http://{config.HOST}:{config.PORT}")
    logger.info(f"Configuration: {MIN_SIGNAL_LENGTH} min samples, {DEFAULT_SAMPLING_RATE}Hz sampling")
    logger.info(f"Environment: {config.FLASK_ENV}")

    app.run(
        host=config.HOST,
        port=config.PORT,
        debug=config.DEBUG,
        threaded=True  # Enable multi-threading for better performance
    )
