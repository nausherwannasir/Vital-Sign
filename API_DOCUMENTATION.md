# Heart Rate Monitor API Documentation

## Overview

This API provides endpoints for contactless heart rate monitoring using remote photoplethysmography (rPPG) technology. The server processes green channel signals extracted from webcam video to estimate heart rate.

## Base URL

```
http://localhost:3000
```

## Authentication

No authentication required for development/demo purposes.

## Endpoints

### POST /predict

Analyzes a photoplethysmographic signal and returns heart rate prediction.

#### Request

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "signal": [0.123, 0.145, 0.132, ...]
}
```

**Parameters:**
- `signal` (array, required): Array of normalized green channel values extracted from facial video frames
  - Type: Array of numbers
  - Range: 0.0 - 1.0 (normalized)
  - Minimum length: 50 samples
  - Recommended length: 150 samples (~5 seconds at 30 FPS)

#### Response

**Success (200 OK):**
```json
{
  "bpm": 72.5
}
```

**Success with no detection (200 OK):**
```json
{
  "bpm": null,
  "message": "No valid heart rate detected"
}
```

**Error (400 Bad Request):**
```json
{
  "error": "Signal too short. Minimum 50 samples required",
  "received": 25
}
```

**Error (500 Internal Server Error):**
```json
{
  "error": "Internal server error"
}
```

#### Response Fields

- `bpm` (number|null): Heart rate in beats per minute, rounded to 1 decimal place
  - Range: 40-200 BPM (physiological range)
  - null if no valid heart rate detected
- `message` (string, optional): Additional information about the result
- `error` (string, optional): Error description for failed requests
- `received` (number, optional): Number of samples received (for validation errors)

#### Error Codes

| Status Code | Description |
|-------------|-------------|
| 400 | Invalid request format, missing parameters, or insufficient data |
| 500 | Internal server processing error |

#### Example Usage

**cURL:**
```bash
curl -X POST http://localhost:3000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "signal": [0.1, 0.15, 0.12, 0.18, 0.14, ...]
  }'
```

**JavaScript (Fetch):**
```javascript
const response = await fetch('/predict', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    signal: greenChannelValues
  })
});

const result = await response.json();
console.log('Heart rate:', result.bpm);
```

**Python (requests):**
```python
import requests

response = requests.post('http://localhost:3000/predict', 
  json={'signal': green_channel_values}
)

result = response.json()
print(f"Heart rate: {result['bpm']} BPM")
```

### GET /health

Health check endpoint for monitoring server status.

#### Request

No parameters required.

#### Response

**Success (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "config": {
    "min_signal_length": 50,
    "sampling_rate": 30,
    "frequency_range": [0.8, 3.0]
  }
}
```

#### Response Fields

- `status` (string): Server health status ("healthy")
- `version` (string): API version
- `config` (object): Server configuration parameters
  - `min_signal_length` (number): Minimum required signal samples
  - `sampling_rate` (number): Expected sampling frequency (Hz)
  - `frequency_range` (array): Valid heart rate frequency range (Hz)

### GET /

Serves the classic frontend interface.

#### Request

No parameters required.

#### Response

Returns the main HTML page for the classic frontend interface.

### GET /<path:path>

Serves static files from the frontend directory.

#### Request

**Path Parameters:**
- `path`: Requested file path relative to frontend directory

#### Response

Returns the requested static file or 404 if not found.

**Error (404 Not Found):**
```json
{
  "error": "File not found"
}
```

## Signal Processing Details

### Input Signal Requirements

The API expects a time-series signal representing green channel values extracted from facial regions of interest (ROI). The signal should be:

1. **Normalized**: Values between 0.0 and 1.0
2. **Continuous**: Evenly sampled at consistent intervals
3. **Sufficient length**: At least 50 samples, preferably 150 samples
4. **Clean**: Minimal motion artifacts and good lighting conditions

### Processing Pipeline

1. **Validation**: Input validation and length checking
2. **Detrending**: DC component removal using scipy.signal.detrend
3. **Filtering**: 4th-order Butterworth bandpass filter (0.8-3.0 Hz)
4. **Spectral Analysis**: Welch's method for power spectral density
5. **Peak Detection**: Identify dominant frequency in physiological range
6. **BPM Calculation**: Convert frequency to beats per minute

### Frequency Range

- **Minimum**: 0.8 Hz (48 BPM)
- **Maximum**: 3.0 Hz (180 BPM)
- **Optimal**: 1.0-2.5 Hz (60-150 BPM)

## Error Handling

### Client Errors (4xx)

| Error | Description | Solution |
|-------|-------------|----------|
| 400 - Invalid JSON | Malformed JSON payload | Ensure valid JSON syntax |
| 400 - Missing signal | Required 'signal' field missing | Include signal array in request body |
| 400 - Signal too short | Insufficient signal samples | Provide at least 50 samples |
| 400 - Invalid values | Non-numeric signal values | Ensure all signal values are numbers |

### Server Errors (5xx)

| Error | Description | Possible Causes |
|-------|-------------|-----------------|
| 500 - Internal Error | Server processing failed | Invalid signal processing, memory issues |

## Rate Limiting

Currently no rate limiting is implemented. For production use, consider implementing:

- Request rate limiting (e.g., 10 requests/second)
- Signal buffer size limits
- Timeout protection for long-running requests

## Security Headers

The API includes security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`  
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy: camera=(self)`

## Development vs Production

### Development Mode
- CORS enabled for React development server
- Detailed error messages
- Debug logging enabled

### Production Recommendations
- Disable debug mode
- Implement rate limiting
- Add authentication if needed
- Use HTTPS for secure video access
- Monitor and log API usage

## Integration Examples

### Frontend Integration

```javascript
// Example rPPG signal extraction and API call
class HeartRateMonitor {
  constructor() {
    this.greenBuffer = [];
    this.bufferSize = 150;
  }

  processFrame(greenValue) {
    this.greenBuffer.push(greenValue);
    if (this.greenBuffer.length > this.bufferSize) {
      this.greenBuffer.shift();
    }

    if (this.greenBuffer.length === this.bufferSize) {
      this.computeHeartRate();
    }
  }

  async computeHeartRate() {
    try {
      const response = await fetch('/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: this.greenBuffer })
      });

      const result = await response.json();
      
      if (result.bpm) {
        console.log(`Heart rate: ${result.bpm} BPM`);
      } else {
        console.log('No heart rate detected');
      }
    } catch (error) {
      console.error('API error:', error);
    }
  }
}
```

### Testing

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test predict endpoint with sample data
curl -X POST http://localhost:3000/predict \
  -H "Content-Type: application/json" \
  -d '{"signal":[0.1,0.15,0.12,0.18,0.14,0.11,0.16,0.13,0.17,0.12,0.15,0.11,0.19,0.14,0.12,0.16,0.13,0.18,0.11,0.15,0.12,0.17,0.14,0.11,0.16,0.13,0.18,0.12,0.15,0.11,0.19,0.14,0.12,0.16,0.13,0.18,0.11,0.15,0.12,0.17,0.14,0.11,0.16,0.13,0.18,0.12,0.15,0.11,0.19,0.14]}'
```

## Version History

### v1.0.0
- Initial API implementation
- Basic signal processing pipeline
- Health check endpoint
- Static file serving
- CORS support for development