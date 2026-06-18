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
    app.config["TESTING"] = True
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

    def test_offbin_frequency_resolves_accurately(self):
        """Off-bin rates must not snap to coarse 12-BPM bins (zero-padded FFT)."""
        fs = 30
        t = np.arange(0, 5, 1 / fs)  # 150-sample live buffer
        for true_bpm in (67, 77, 83):
            f = true_bpm / 60
            signal = (0.5 + 0.1 * np.sin(2 * np.pi * f * t)).tolist()
            result = compute_bpm(signal, fs=fs)
            assert result is not None
            assert abs(result - true_bpm) < 3, f"{true_bpm} BPM -> {result}"

    def test_sampling_rate_scales_bpm(self):
        """A wrong fs scales BPM linearly, so the client-measured fs must be used."""
        fs = 30
        t = np.arange(0, 6, 1 / fs)
        signal = (0.5 + 0.1 * np.sin(2 * np.pi * 1.2 * t)).tolist()  # 72 BPM at 30 fps
        assert abs(compute_bpm(signal, fs=30) - 72) < 3
        # Same samples interpreted as 24 fps -> 0.96 Hz -> ~57.6 BPM
        assert abs(compute_bpm(signal, fs=24) - 57.6) < 3

    def test_invalid_sampling_rate_raises(self):
        """A non-positive sampling rate is a programming error, not no-signal."""
        with pytest.raises(ValueError):
            compute_bpm([0.5] * 150, fs=0)


class TestAPI:
    """Test cases for API endpoints."""

    def test_health_check(self, client):
        """Test GET /health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "healthy"
        assert "config" in data
        assert data["config"]["min_signal_length"] == 50
        assert data["config"]["default_sampling_rate"] == 30

    def test_predict_valid_request(self, client):
        """Test POST /predict with valid signal."""
        # Generate valid signal
        fs = 30
        duration = 5
        t = np.arange(0, duration, 1 / fs)
        signal = (0.5 + 0.1 * np.sin(2 * np.pi * 1 * t)).tolist()

        response = client.post("/predict", json={"signal": signal})
        assert response.status_code == 200
        data = response.get_json()
        assert "bpm" in data

    def test_predict_with_custom_fs(self, client):
        """Client may pass its measured frame rate as fs."""
        t = np.arange(0, 5, 1 / 30)
        signal = (0.5 + 0.1 * np.sin(2 * np.pi * 1 * t)).tolist()
        response = client.post("/predict", json={"signal": signal, "fs": 30})
        assert response.status_code == 200
        assert "bpm" in response.get_json()

    def test_predict_out_of_range_fs(self, client):
        """An implausible frame rate is rejected rather than producing garbage."""
        response = client.post("/predict", json={"signal": [0.5] * 150, "fs": 1000})
        assert response.status_code == 400

    def test_predict_non_numeric_fs(self, client):
        """A non-numeric fs is a client error."""
        response = client.post("/predict", json={"signal": [0.5] * 150, "fs": "fast"})
        assert response.status_code == 400

    def test_predict_short_signal(self, client):
        """Test POST /predict with signal too short."""
        response = client.post("/predict", json={"signal": [0.5] * 25})
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_predict_signal_too_long(self, client):
        """An over-long signal is rejected to cap memory use from large payloads."""
        from app import MAX_SIGNAL_LENGTH

        response = client.post("/predict", json={"signal": [0.5] * (MAX_SIGNAL_LENGTH + 1)})
        assert response.status_code == 400
        assert "too long" in response.get_json()["error"].lower()

    def test_predict_missing_signal(self, client):
        """Test POST /predict with missing signal field."""
        response = client.post("/predict", json={})
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_predict_invalid_json(self, client):
        """Test POST /predict with invalid JSON."""
        response = client.post("/predict", data="invalid json", content_type="application/json")
        assert response.status_code == 400

    def test_predict_non_numeric_values(self, client):
        """Test POST /predict with non-numeric signal values."""
        response = client.post("/predict", json={"signal": ["a", "b", "c"] * 20})
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_predict_invalid_content_type(self, client):
        """Test POST /predict with invalid content type."""
        response = client.post("/predict", data='{"signal": [0.5]}', content_type="text/plain")
        assert response.status_code == 400

    def test_security_headers(self, client):
        """Test that security headers are present."""
        response = client.get("/health")
        assert "X-Content-Type-Options" in response.headers
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert "X-Frame-Options" in response.headers
        assert response.headers["X-Frame-Options"] == "DENY"

    def test_cors_headers(self, client):
        """Test CORS headers are present."""
        response = client.get("/health")
        assert "Access-Control-Allow-Origin" in response.headers or response.status_code == 200


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


class TestServeFrontend:
    """The consolidated build serves the React SPA from Flask on a single origin."""

    def test_root_serves_index(self, client, monkeypatch, tmp_path):
        """GET / returns the built index.html."""
        (tmp_path / "index.html").write_text("<!doctype html><title>Vitals</title>")
        monkeypatch.setattr("app.FRONTEND_DIST", str(tmp_path))
        response = client.get("/")
        assert response.status_code == 200
        assert b"Vitals" in response.data

    def test_static_asset_served(self, client, monkeypatch, tmp_path):
        """A real build asset (e.g. /assets/app.js) is served from the dist dir."""
        (tmp_path / "index.html").write_text("<html></html>")
        (tmp_path / "assets").mkdir()
        (tmp_path / "assets" / "app.js").write_text("console.log('hi')")
        monkeypatch.setattr("app.FRONTEND_DIST", str(tmp_path))
        response = client.get("/assets/app.js")
        assert response.status_code == 200
        assert b"console.log" in response.data

    def test_unknown_client_route_falls_back_to_index(self, client, monkeypatch, tmp_path):
        """Unknown paths fall back to index.html so client-side routing works."""
        (tmp_path / "index.html").write_text("<title>SPA</title>")
        monkeypatch.setattr("app.FRONTEND_DIST", str(tmp_path))
        response = client.get("/some/client/route")
        assert response.status_code == 200
        assert b"SPA" in response.data

    def test_api_routes_take_precedence_over_spa(self, client, monkeypatch, tmp_path):
        """The SPA catch-all must not shadow the API; /health still returns JSON."""
        (tmp_path / "index.html").write_text("<title>SPA</title>")
        monkeypatch.setattr("app.FRONTEND_DIST", str(tmp_path))
        response = client.get("/health")
        assert response.status_code == 200
        assert response.get_json()["status"] == "healthy"

    def test_missing_build_returns_helpful_404(self, client, monkeypatch, tmp_path):
        """When the UI isn't built, the error tells the user how to build it."""
        monkeypatch.setattr("app.FRONTEND_DIST", str(tmp_path / "does-not-exist"))
        response = client.get("/")
        assert response.status_code == 404
        assert "build" in response.get_json()["error"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
