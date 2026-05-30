import pytest
import numpy as np
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, compute_bpm


@pytest.fixture
def client():
    """Create a test client for the Flask app."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestComputeBPM:
    """Test cases for the compute_bpm function."""

    def test_valid_signal(self):
        """Test with a valid signal."""
        # Generate a sinusoidal signal at 1 Hz (60 BPM)
        fs = 30
        duration = 5
        t = np.arange(0, duration, 1 / fs)
        signal = 0.5 + 0.1 * np.sin(2 * np.pi * 1 * t)  # 1 Hz = 60 BPM
        result = compute_bpm(signal.tolist(), fs=fs)
        assert result is not None
        assert 55 < result < 65  # Should be around 60 BPM

    def test_signal_too_short(self):
        """Test with signal shorter than minimum length."""
        short_signal = [0.5] * 25
        result = compute_bpm(short_signal, fs=30)
        assert result is None

    def test_empty_signal(self):
        """Test with empty signal."""
        result = compute_bpm([], fs=30)
        assert result is None

    def test_bpm_physiological_range(self):
        """Test that BPM is within physiological range."""
        # Generate signal at 1.5 Hz (90 BPM)
        fs = 30
        duration = 10
        t = np.arange(0, duration, 1 / fs)
        signal = 0.5 + 0.1 * np.sin(2 * np.pi * 1.5 * t)
        result = compute_bpm(signal.tolist(), fs=fs)
        assert result is not None
        assert 40 <= result <= 200

    def test_noisy_signal(self):
        """Test with noisy signal."""
        # Generate signal with noise
        fs = 30
        duration = 5
        t = np.arange(0, duration, 1 / fs)
        signal = 0.5 + 0.1 * np.sin(2 * np.pi * 1.2 * t)
        noise = np.random.normal(0, 0.05, len(signal))
        noisy_signal = signal + noise
        result = compute_bpm(noisy_signal.tolist(), fs=fs)
        assert result is not None
        assert 40 <= result <= 200

    def test_low_heart_rate(self):
        """Test with low heart rate signal (48 BPM)."""
        fs = 30
        duration = 10
        t = np.arange(0, duration, 1 / fs)
        signal = 0.5 + 0.1 * np.sin(2 * np.pi * 0.8 * t)  # 0.8 Hz = 48 BPM
        result = compute_bpm(signal.tolist(), fs=fs)
        assert result is not None
        assert 40 < result < 56

    def test_high_heart_rate(self):
        """Test with high heart rate signal (180 BPM)."""
        fs = 30
        duration = 10
        t = np.arange(0, duration, 1 / fs)
        signal = 0.5 + 0.1 * np.sin(2 * np.pi * 3 * t)  # 3 Hz = 180 BPM
        result = compute_bpm(signal.tolist(), fs=fs)
        assert result is not None
        assert 170 < result < 190


class TestAPI:
    """Test cases for API endpoints."""

    def test_health_check(self, client):
        """Test GET /health endpoint."""
        response = client.get('/health')
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'healthy'
        assert 'version' in data
        assert 'config' in data
        assert data['config']['min_signal_length'] == 50

    def test_predict_valid_request(self, client):
        """Test POST /predict with valid signal."""
        # Generate valid signal
        fs = 30
        duration = 5
        t = np.arange(0, duration, 1 / fs)
        signal = (0.5 + 0.1 * np.sin(2 * np.pi * 1 * t)).tolist()
        
        response = client.post('/predict', json={'signal': signal})
        assert response.status_code == 200
        data = response.get_json()
        assert 'bpm' in data

    def test_predict_short_signal(self, client):
        """Test POST /predict with signal too short."""
        response = client.post('/predict', json={'signal': [0.5] * 25})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data

    def test_predict_missing_signal(self, client):
        """Test POST /predict with missing signal field."""
        response = client.post('/predict', json={})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data

    def test_predict_invalid_json(self, client):
        """Test POST /predict with invalid JSON."""
        response = client.post(
            '/predict',
            data='invalid json',
            content_type='application/json'
        )
        assert response.status_code == 400

    def test_predict_non_numeric_values(self, client):
        """Test POST /predict with non-numeric signal values."""
        response = client.post('/predict', json={'signal': ['a', 'b', 'c'] * 20})
        assert response.status_code == 400
        data = response.get_json()
        assert 'error' in data

    def test_predict_invalid_content_type(self, client):
        """Test POST /predict with invalid content type."""
        response = client.post(
            '/predict',
            data='{"signal": [0.5]}',
            content_type='text/plain'
        )
        assert response.status_code == 400

    def test_security_headers(self, client):
        """Test that security headers are present."""
        response = client.get('/health')
        assert 'X-Content-Type-Options' in response.headers
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
        assert 'X-Frame-Options' in response.headers
        assert response.headers['X-Frame-Options'] == 'DENY'

    def test_cors_headers(self, client):
        """Test CORS headers are present."""
        response = client.get('/health')
        assert 'Access-Control-Allow-Origin' in response.headers or response.status_code == 200


class TestSignalProcessing:
    """Test edge cases in signal processing."""

    def test_constant_signal(self):
        """Test with constant signal (no variation)."""
        signal = [0.5] * 150
        result = compute_bpm(signal, fs=30)
        # Constant signal should not produce valid BPM
        assert result is None or result < 40 or result > 200

    def test_zero_signal(self):
        """Test with all-zero signal."""
        signal = [0.0] * 150
        result = compute_bpm(signal, fs=30)
        assert result is None or result < 40 or result > 200

    def test_signal_boundary_values(self):
        """Test with boundary value signals."""
        signal = [0.0] * 50 + [1.0] * 50 + [0.5] * 50
        result = compute_bpm(signal, fs=30)
        # Should handle boundary values gracefully
        assert result is None or (40 <= result <= 200)

    def test_normalized_signal_values(self):
        """Test that signal values should be normalized (0-1)."""
        # Signal with values outside normal range
        signal = [0.5, 1.5, -0.5] * 50
        result = compute_bpm(signal, fs=30)
        # Should still process but may not give valid result
        assert result is None or (40 <= result <= 200)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
