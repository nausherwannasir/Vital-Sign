# Vital-Sign Architecture

This document describes the high-level architecture and design of the Vital-Sign project.

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │             React UI / HTML Frontend                 │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │ • Video Capture & Display                            │   │
│  │ • Face Detection (MediaPipe)                         │   │
│  │ • Signal Extraction (Green Channel)                  │   │
│  │ • Real-time Visualization                            │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ HTTP                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────────────────┐
              │  HTTP/REST API Layer    │
              │  (Flask + CORS)         │
              └─────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  SERVER (Python Backend)                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           API Endpoints                              │   │
│  │  • POST /predict  - Heart rate analysis              │   │
│  │  • GET /health    - Server status                    │   │
│  │  • GET / <path>   - Static files                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │       Signal Processing Pipeline                     │   │
│  │  1. Input Validation                                 │   │
│  │  2. Detrending                                       │   │
│  │  3. Bandpass Filtering                               │   │
│  │  4. Spectral Analysis (Welch)                        │   │
│  │  5. Peak Detection                                   │   │
│  │  6. BPM Calculation & Validation                     │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Configuration Management                     │   │
│  │  • Environment variables                             │   │
│  │  • Signal processing parameters                      │   │
│  │  • Security settings                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Components

#### React UI (my-vitals-ui/)
```
App.jsx (Main Container)
├── Dashboard
│   ├── VideoFeed
│   │   └── Canvas (face detection overlay)
│   ├── HeartRateDisplay
│   ├── LightingIndicator
│   └── ControlPanel
└── useRPPG Hook (Business Logic)
    ├── Video capture management
    ├── Face detection
    ├── Signal extraction
    └── API communication
```

#### Classic UI (frontend/)
- Simple HTML/JS for lightweight option
- Direct MediaPipe integration
- Minimal dependencies
- Real-time visualization

### Backend Structure

#### Flask Application (backend/app.py)
```python
app = Flask(__name__)
CORS(app)

├── POST /predict
│   ├── Validate input
│   ├── Call compute_bpm()
│   └── Return result
├── GET /health
│   └── Return server status
├── GET / & /<path>
│   └── Serve static files
└── Middleware
    └── add_security_headers()
```

#### Signal Processing Pipeline (compute_bpm)
```python
compute_bpm(signal, fs=30)
├── Input Validation
│   └── Check length, type
├── Detrending
│   └── Remove DC + linear trend
├── Filtering
│   ├── Design Butterworth filter
│   └── Apply via filtfilt()
├── Spectral Analysis
│   ├── Welch's PSD method
│   └── Extract frequency components
├── Peak Detection
│   ├── Find max power in HR range
│   └── Convert freq to BPM
└── Output Validation
    └── Check physiological range (40-200)
```

#### Configuration (backend/config.py)
```python
Config (Base)
├── DevelopmentConfig
├── ProductionConfig
└── TestingConfig

Parameters:
├── Flask settings
├── Signal processing params
├── CORS configuration
├── Security settings
└── Logging configuration
```

## Data Flow

### Real-time Heart Rate Monitoring

```
1. VIDEO CAPTURE (Client)
   ├── WebRTC/getUserMedia API
   └── 30 FPS video stream

2. FRAME PROCESSING (Client - Real-time)
   ├── Extract frame
   ├── Detect face (MediaPipe)
   ├── Extract facial ROI
   └── Sample green channel value
   
3. SIGNAL BUFFERING (Client)
   ├── Store in circular buffer (150 samples)
   ├── Every frame adds new sample
   └── Every 5 seconds, full buffer available
   
4. API CALL (Client → Server)
   ├── POST /predict
   ├── Send buffer as JSON array
   └── Receive BPM response
   
5. SIGNAL ANALYSIS (Server)
   ├── Validate input (length, type)
   ├── Apply detrending
   ├── Apply bandpass filter
   ├── Compute power spectrum
   ├── Find dominant frequency
   └── Convert to BPM
   
6. RESPONSE (Server → Client)
   ├── Return {"bpm": 72.5}
   └── Update UI display
   
7. UI UPDATE (Client)
   ├── Display BPM value
   ├── Update heart animation
   ├── Show confidence indicator
   └── Log to history
```

## Signal Processing Details

### Detrending
- Removes DC component (average)
- Removes linear trends
- Preserves AC component (pulsatile signal)

### Butterworth Bandpass Filter
- Type: 4th order Butterworth
- Passband: 0.8 - 3.0 Hz (48-180 BPM)
- Properties:
  - Maximally flat response
  - Phase distortion minimized with filtfilt
  - Removes noise outside HR frequency band

### Welch's Spectral Density
- Divide signal into overlapping segments
- Apply window (Hann)
- Compute FFT of each segment
- Average power spectra
- Advantages:
  - Reduced spectral leakage
  - Smoother spectrum estimate
  - More robust than single FFT

### Peak Detection
- Find frequency with maximum power in 0.8-3.0 Hz band
- Convert frequency (Hz) to BPM: `BPM = frequency * 60`
- Validate result is within physiological range: 40-200 BPM

## API Contract

### POST /predict

**Request:**
```json
{
  "signal": [0.123, 0.145, 0.132, ...]
}
```

**Response (Success):**
```json
{
  "bpm": 72.5
}
```

**Response (No detection):**
```json
{
  "bpm": null,
  "message": "No valid heart rate detected"
}
```

**Response (Error):**
```json
{
  "error": "Signal too short. Minimum 50 samples required",
  "received": 25
}
```

### GET /health

**Response:**
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

## Technology Stack

### Frontend
- **React 18**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **MediaPipe**: Face detection
- **Framer Motion**: Animations
- **Jest**: Testing

### Backend
- **Python 3.8+**: Runtime
- **Flask**: Web framework
- **NumPy**: Numerical computing
- **SciPy**: Signal processing
- **Pytest**: Testing

### DevOps
- **Docker**: Containerization
- **GitHub Actions**: CI/CD
- **Docker Compose**: Orchestration

## Performance Considerations

### Client-Side
- **Video Resolution**: 320x240 (reduced for performance)
- **Processing**: ~30ms per frame
- **Buffer Size**: 150 frames (~5 seconds)
- **Update Frequency**: 1 Hz (API call every 5 seconds)

### Server-Side
- **Signal Length**: 50-150 samples
- **Processing Time**: ~10-50ms
- **Memory**: <100MB per process
- **Throughput**: 1000+ requests/second (tested)

### Network
- **Payload Size**: ~1-2 KB per request
- **Latency**: <100ms typical
- **Compression**: Not needed (small payloads)

## Security Architecture

### Input Validation
- Signal length check (min 50, max 10000 samples)
- Type validation (array of numbers)
- Value range validation (0.0-1.0)

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Permissions-Policy: camera=(self)`

### CORS Policy
- Configurable origins
- Credentials support
- Methods: GET, POST, OPTIONS

### Best Practices
- Rate limiting (optional, configurable)
- HTTPS enforcement (production)
- Input sanitization
- Error message sanitization

## Deployment Architecture

### Docker Multi-Stage Build
```dockerfile
Stage 1: Build Python environment
Stage 2: Build Node environment
Stage 3: Production runtime
```

### Docker Compose Orchestration
```yaml
services:
  backend:
    - Flask app
    - Health checks
    - Volume mounts for dev
  frontend:
    - Built React app
    - Static file server
    - Dependency on backend
```

## Testing Strategy

### Unit Tests (Backend)
- Signal processing functions
- API endpoints
- Error handling
- Edge cases

### Component Tests (Frontend)
- React components
- Custom hooks
- User interactions
- Error states

### Integration Tests
- Full signal to BPM pipeline
- API communication
- Error scenarios

### CI/CD Pipeline
- Run tests on every push
- Check code quality
- Build Docker images
- Security scanning

## Future Architecture Improvements

1. **Caching Layer**: Redis for signal caching
2. **Message Queue**: Celery for async processing
3. **Database**: Store heart rate history
4. **Analytics**: Track accuracy and usage
5. **Machine Learning**: Improve signal processing
6. **Microservices**: Separate services for different tasks
