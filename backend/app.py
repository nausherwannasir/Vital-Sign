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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="../frontend")
CORS(app)  # Enable CORS for React development server

# Configuration constants
MIN_SIGNAL_LENGTH = 50  # Minimum required signal samples
DEFAULT_SAMPLING_RATE = 30  # Default sampling frequency (Hz)
MIN_HR_FREQ = 0.8  # Minimum heart rate frequency (Hz) - 48 BPM
MAX_HR_FREQ = 3.0  # Maximum heart rate frequency (Hz) - 180 BPM
FILTER_ORDER = 4   # Butterworth filter order
WELCH_SEGMENT_SIZE = 128  # Segment size for Welch's method

def compute_bpm(rgb_signals: dict, fs: int = DEFAULT_SAMPLING_RATE) -> Optional[float]:
    """
    Compute heart rate (BPM) using chrominance-based rPPG method.
    
    This implements the CHROM method by de Haan & Jeanne (2013) which is more
    robust than simple green channel analysis.
    
    Args:
        rgb_signals (dict): Dictionary containing 'r', 'g', 'b' signal arrays
        fs (int, optional): Sampling frequency in Hz. Defaults to 30.
    
    Returns:
        Optional[float]: Heart rate in beats per minute, or None if no valid peak found
    
    Raises:
        ValueError: If signals are too short or sampling rate is invalid
    """
    try:
        # Input validation
        required_keys = ['r', 'g', 'b']
        if not all(key in rgb_signals for key in required_keys):
            logger.warning("Missing RGB signal components")
            return None
            
        signal_length = len(rgb_signals['r'])
        if signal_length < MIN_SIGNAL_LENGTH:
            logger.warning(f"Signal too short: {signal_length} < {MIN_SIGNAL_LENGTH}")
            return None
            
        if fs <= 0:
            raise ValueError("Sampling frequency must be positive")
        
        # Convert to numpy arrays
        r_signal = np.array(rgb_signals['r'], dtype=np.float64)
        g_signal = np.array(rgb_signals['g'], dtype=np.float64)
        b_signal = np.array(rgb_signals['b'], dtype=np.float64)
        
        # Validate signal lengths are consistent
        if not (len(r_signal) == len(g_signal) == len(b_signal)):
            logger.warning("RGB signal lengths are inconsistent")
            return None
        
        # Apply temporal normalization (standardization)
        r_signal = temporal_normalize(r_signal)
        g_signal = temporal_normalize(g_signal)
        b_signal = temporal_normalize(b_signal)
        
        # CHROM method: Chrominance-based rPPG
        # Based on de Haan & Jeanne (2013)
        x_chrom = 3 * r_signal - 2 * g_signal
        y_chrom = 1.5 * r_signal + g_signal - 1.5 * b_signal
        
        # Apply moving average filter to reduce noise
        window_size = max(5, fs // 6)  # ~5 samples at 30fps
        x_chrom = moving_average(x_chrom, window_size)
        y_chrom = moving_average(y_chrom, window_size)
        
        # Compute alpha (adaptive balancing)
        alpha = np.std(x_chrom) / np.std(y_chrom) if np.std(y_chrom) > 0 else 1.0
        
        # Pulse signal
        pulse_signal = x_chrom - alpha * y_chrom
        
        # Additional preprocessing
        pulse_signal = detrend(pulse_signal)
        
        # Apply optimized bandpass filter
        bpm_result = extract_heart_rate_from_pulse(pulse_signal, fs)
        
        if bpm_result:
            logger.info(f"CHROM BPM: {bpm_result:.1f}")
            return bpm_result
        
        # Fallback to improved GREEN method if CHROM fails
        logger.info("CHROM failed, trying improved GREEN method")
        return fallback_green_method(g_signal, fs)
        
    except Exception as e:
        logger.error(f"Error computing BPM: {str(e)}")
        return None

def temporal_normalize(signal: np.ndarray) -> np.ndarray:
    """
    Apply temporal normalization to remove illumination changes.
    
    Args:
        signal: Input signal array
        
    Returns:
        Normalized signal
    """
    # Remove DC component
    signal_mean = np.mean(signal)
    if signal_mean > 0:
        signal = signal / signal_mean - 1.0
    else:
        signal = detrend(signal)
    
    return signal

def moving_average(signal: np.ndarray, window_size: int) -> np.ndarray:
    """
    Apply moving average filter to reduce noise.
    
    Args:
        signal: Input signal
        window_size: Size of the moving window
        
    Returns:
        Filtered signal
    """
    if window_size <= 1:
        return signal
    
    # Use convolution for efficient moving average
    kernel = np.ones(window_size) / window_size
    # Use 'same' mode to maintain signal length
    return np.convolve(signal, kernel, mode='same')

def extract_heart_rate_from_pulse(pulse_signal: np.ndarray, fs: int) -> Optional[float]:
    """
    Extract heart rate from pulse signal using improved spectral analysis.
    
    Args:
        pulse_signal: Preprocessed pulse signal
        fs: Sampling frequency
        
    Returns:
        Heart rate in BPM or None
    """
    try:
        # Apply adaptive bandpass filter
        nyquist = fs / 2
        low_cutoff = MIN_HR_FREQ / nyquist
        high_cutoff = MAX_HR_FREQ / nyquist
        
        # Ensure valid cutoff frequencies
        high_cutoff = min(high_cutoff, 0.99)
        
        # Use higher order filter for better frequency selectivity
        filter_order = min(6, len(pulse_signal) // 20)  # Adaptive filter order
        b, a = butter(filter_order, [low_cutoff, high_cutoff], btype='band')
        filtered_signal = filtfilt(b, a, pulse_signal)
        
        # Improved spectral analysis
        # Use optimal segment size for given signal length
        segment_length = min(len(filtered_signal) // 2, 256)
        overlap = segment_length // 2
        
        frequencies, power_spectrum = welch(
            filtered_signal,
            fs=fs,
            nperseg=segment_length,
            noverlap=overlap,
            window='hann'
        )
        
        # Find peaks in physiological range
        freq_mask = np.logical_and(frequencies >= MIN_HR_FREQ, frequencies <= MAX_HR_FREQ)
        
        if not np.any(freq_mask):
            return None
        
        valid_frequencies = frequencies[freq_mask]
        valid_power = power_spectrum[freq_mask]
        
        # Find the most prominent peak
        peak_idx = np.argmax(valid_power)
        peak_freq = valid_frequencies[peak_idx]
        peak_power = valid_power[peak_idx]
        
        # Validate peak quality
        # Check if peak is significantly higher than surrounding frequencies
        noise_floor = np.median(valid_power)
        snr = peak_power / noise_floor if noise_floor > 0 else 0
        
        if snr < 2.0:  # Minimum signal-to-noise ratio
            logger.warning(f"Low SNR detected: {snr:.2f}")
            return None
        
        # Convert to BPM
        bpm = float(peak_freq * 60)
        
        # Additional validation: check for harmonics
        # If detected BPM is likely a harmonic, try to find the fundamental
        if bpm > 120:  # Likely harmonic
            fundamental_freq = peak_freq / 2
            if MIN_HR_FREQ <= fundamental_freq <= MAX_HR_FREQ:
                # Check if fundamental has significant power
                fundamental_idx = np.argmin(np.abs(valid_frequencies - fundamental_freq))
                fundamental_power = valid_power[fundamental_idx]
                
                if fundamental_power > peak_power * 0.5:  # Strong fundamental
                    bpm = float(fundamental_freq * 60)
                    logger.info(f"Using fundamental frequency: {bpm:.1f} BPM")
        
        return bpm
        
    except Exception as e:
        logger.error(f"Error in spectral analysis: {str(e)}")
        return None

def fallback_green_method(g_signal: np.ndarray, fs: int) -> Optional[float]:
    """
    Fallback method using improved green channel analysis.
    
    Args:
        g_signal: Green channel signal
        fs: Sampling frequency
        
    Returns:
        Heart rate in BPM or None
    """
    try:
        # Normalize green signal
        g_normalized = temporal_normalize(g_signal)
        
        # Apply stronger preprocessing for green channel
        g_filtered = moving_average(g_normalized, max(3, fs // 10))
        g_filtered = detrend(g_filtered)
        
        return extract_heart_rate_from_pulse(g_filtered, fs)
        
    except Exception as e:
        logger.error(f"Error in fallback green method: {str(e)}")
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
        
        # Validate signal data - support both old (green-only) and new (RGB) formats
        rgb_signals = {}
        
        # Check if new RGB format is provided
        if 'rgb_signals' in data:
            rgb_data = data['rgb_signals']
            if not isinstance(rgb_data, dict):
                return jsonify({'error': 'rgb_signals must be an object'}), 400
            
            required_channels = ['r', 'g', 'b']
            for channel in required_channels:
                if channel not in rgb_data:
                    return jsonify({'error': f'Missing {channel} channel in rgb_signals'}), 400
                
                if not isinstance(rgb_data[channel], list):
                    return jsonify({'error': f'{channel} channel must be an array'}), 400
                
                if len(rgb_data[channel]) < MIN_SIGNAL_LENGTH:
                    return jsonify({
                        'error': f'{channel} signal too short. Minimum {MIN_SIGNAL_LENGTH} samples required',
                        'received': len(rgb_data[channel])
                    }), 400
                
                # Validate and convert signal values
                try:
                    rgb_signals[channel] = [float(x) for x in rgb_data[channel]]
                except (ValueError, TypeError):
                    return jsonify({'error': f'{channel} signal values must be numeric'}), 400
            
            # Validate all channels have same length
            lengths = [len(rgb_signals[ch]) for ch in required_channels]
            if not all(l == lengths[0] for l in lengths):
                return jsonify({'error': 'All RGB channels must have the same length'}), 400
        
        # Check for legacy single signal format (backward compatibility)
        elif 'signal' in data:
            legacy_signal = data['signal']
            if not isinstance(legacy_signal, list):
                return jsonify({'error': 'Signal must be an array'}), 400
            
            if len(legacy_signal) < MIN_SIGNAL_LENGTH:
                logger.info(f"Signal too short: {len(legacy_signal)} samples")
                return jsonify({
                    'error': f'Signal too short. Minimum {MIN_SIGNAL_LENGTH} samples required',
                    'received': len(legacy_signal)
                }), 400
            
            # Validate signal values
            try:
                signal_array = [float(x) for x in legacy_signal]
            except (ValueError, TypeError):
                return jsonify({'error': 'Signal values must be numeric'}), 400
            
            # Convert legacy format to RGB (assume it's green channel)
            rgb_signals = {
                'r': signal_array,  # Use same signal for all channels as fallback
                'g': signal_array,
                'b': signal_array
            }
            logger.info("Using legacy signal format (backward compatibility)")
        
        else:
            return jsonify({'error': 'Missing signal data. Provide either "rgb_signals" or "signal"'}), 400
        
        # Compute heart rate using improved algorithm
        bpm = compute_bpm(rgb_signals, fs=DEFAULT_SAMPLING_RATE)
        
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
    logger.info(f"Server will be available at http://localhost:3000")
    logger.info(f"Configuration: {MIN_SIGNAL_LENGTH} min samples, {DEFAULT_SAMPLING_RATE}Hz sampling")
    
    app.run(
        host='0.0.0.0', 
        port=3000,
        debug=False,  # Set to False for production
        threaded=True  # Enable multi-threading for better performance
    )
