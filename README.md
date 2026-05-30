# Contactless Heart Rate Monitor

[![Python Tests](https://github.com/nausherwannasir/Vital-Sign/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/nausherwannasir/Vital-Sign/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Docker Ready](https://img.shields.io/badge/docker-ready-0db7ed.svg)](https://hub.docker.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **real-time contactless heart rate monitoring system** using remote photoplethysmography (rPPG) technology. Detects heart rate through webcam video analysis of subtle color changes in facial skin caused by blood circulation.

**Perfect for**: Health monitoring apps, fitness trackers, research projects, and accessibility applications.

---

## 🎯 Key Features

- ✅ **Real-time Heart Rate Detection**: Contactless BPM measurement using standard webcam
- ✅ **Cross-Platform Support**: Works on PC, Mac, Linux, and mobile browsers
- ✅ **Dual Frontend Options**: Classic HTML/JS for simplicity, modern React UI for advanced features
- ✅ **Advanced Signal Processing**: Butterworth filtering + Welch's spectral analysis
- ✅ **MediaPipe Integration**: Robust face detection and facial landmark tracking
- ✅ **Lighting Quality Assessment**: Automatic feedback on capture conditions
- ✅ **Production Ready**: Docker support, CI/CD pipeline, comprehensive tests
- ✅ **Mobile Optimized**: PWA support, responsive design, touch-friendly interface
- ✅ **Privacy First**: All processing happens locally, no data storage

---

## 🚀 Quick Start

### Option 1: Docker (Recommended - One Command)

```bash
# Clone the repository
git clone https://github.com/nausherwannasir/Vital-Sign.git
cd Vital-Sign

# Start everything with Docker Compose
docker-compose up

# Open browser
# Backend: http://localhost:3000
# Frontend: http://localhost:3001
```

### Option 2: Local Development

**Prerequisites**: Python 3.8+, Node.js 16+, Modern web browser

```bash
# Clone repository
git clone https://github.com/nausherwannasir/Vital-Sign.git
cd Vital-Sign

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
# Server runs on http://localhost:3000

# In another terminal, Frontend setup
cd my-vitals-ui
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 📋 How It Works

```
┌─────────────────────┐
│  Webcam Video Feed  │
└──────────┬──────────┘
           │
    ┌──────▼──────┐
    │ Face Detection (MediaPipe)
    └──────┬──────┘
           │
    ┌──────▼────────────┐
    │ Extract Green Channel
    │ (ROI: Forehead, cheeks, nose)
    └──────┬────────────┘
           │
    ┌──────▼──────────────┐
    │ Signal Processing:
    │ - Detrending
    │ - Bandpass Filter (0.8-3.0 Hz)
    │ - Spectral Analysis (Welch's method)
    └──────┬──────────────┘
           │
    ┌──────▼─────────┐
    │ Peak Detection │
    │ (48-180 BPM)   │
    └──────┬─────────┘
           │
        ┌──▼──┐
        │ BPM │
        └─────┘
```

**Signal Processing Pipeline:**
1. **Detrending**: Removes DC component and trends
2. **Bandpass Filter**: 4th-order Butterworth (0.8-3.0 Hz)
3. **Spectral Analysis**: Welch's method with 128-sample segments
4. **Peak Detection**: Identifies maximum power in physiological range

---

## 🏗️ Architecture

```
Vital-Sign/
├── backend/                 # Flask API Server
│   ├── app.py             # Main application
│   ├── config.py          # Configuration management
│   ├── requirements.txt    # Python dependencies
│   ├── requirements-dev.txt # Dev dependencies
│   └── tests/             # Unit tests
├── frontend/              # Classic HTML/JS Interface
│   ├── index.html
│   ├── css/styles.css
│   └── js/rppg.js
├── my-vitals-ui/          # Modern React UI
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── hooks/
│   ├── package.json
│   └── tailwind.config.js
├── Dockerfile.backend     # Backend container
├── Dockerfile.frontend    # Frontend container
├── docker-compose.yml     # Full stack orchestration
└── .github/workflows/     # CI/CD pipelines
```

---

## 📊 API Documentation

### POST /predict
Analyzes a photoplethysmographic signal and returns heart rate prediction.

**Request:**
```json
{
  "signal": [0.123, 0.145, 0.132, ...]
}
```

**Response:**
```json
{
  "bpm": 72.5,
  "confidence": 0.92
}
```

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for full details.

---

## 🔧 Configuration

### Environment Variables
Create a `.env` file based on `.env.example`:

```bash
# Backend settings
FLASK_ENV=development
FLASK_HOST=0.0.0.0
FLASK_PORT=3000

# Signal processing
SAMPLING_RATE=30
MIN_SIGNAL_LENGTH=50
MIN_HR_FREQ=0.8
MAX_HR_FREQ=3.0

# Security
RATE_LIMIT_ENABLED=False
```

---

## 🧪 Testing

### Backend Tests
```bash
cd backend
pip install -r requirements-dev.txt
pytest tests/ -v --cov=.
```

### Frontend Tests
```bash
cd my-vitals-ui
npm install
npm test
```

### Code Quality
```bash
# Backend
cd backend
black . --check
flake8 .

# Frontend
cd my-vitals-ui
npm run lint
npm run format
```

---

## 📱 Browser Support

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome/Chromium | ✅ Recommended | Best performance |
| Firefox | ✅ Supported | Good compatibility |
| Safari | ✅ Supported | iOS 14+ |
| Edge | ✅ Supported | Chromium-based |
| Mobile Safari | ✅ Supported | iOS 14.3+ |
| Chrome Mobile | ✅ Supported | Android 5+ |

---

## 🔒 Privacy & Security

- **Local Processing**: All video analysis happens in your browser/device
- **No Data Storage**: Video frames are never stored or transmitted
- **HTTPS Ready**: Deploy with SSL/TLS for production
- **Webcam Permissions**: Users grant explicit access
- **Security Headers**: CORS, CSP, X-Frame-Options configured

---

## 🛠️ Development

### Get Started Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and run tests
4. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

### Development Setup
```bash
# Clone and setup
git clone https://github.com/yourusername/Vital-Sign.git
cd Vital-Sign

# Install all dependencies
pip install -r backend/requirements-dev.txt
cd my-vitals-ui && npm install

# Run tests before committing
cd backend && pytest
cd ../my-vitals-ui && npm test
```

---

## 📈 Performance Metrics

- **Latency**: ~100-200ms from video frame to BPM output
- **Accuracy**: ±5 BPM under good lighting conditions
- **Buffer Size**: 150 frames (~5 seconds at 30 FPS)
- **Update Frequency**: 1 Hz refresh rate
- **CPU Usage**: 5-15% on modern devices

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| No webcam access | Use HTTPS or localhost, check browser permissions |
| Poor lighting warning | Use well-lit environment, avoid backlighting |
| Unstable readings | Keep head still, ensure face is fully visible |
| Connection errors | Verify backend is running on port 3000 |
| No face detected | Position face clearly in frame, ensure good lighting |

---

## 📚 Deployment Guides

- [Docker Deployment](DEPLOYMENT.md#docker)
- [Heroku Deployment](DEPLOYMENT.md#heroku)
- [AWS EC2 Deployment](DEPLOYMENT.md#aws)
- [Self-Hosted VPS](DEPLOYMENT.md#vps)

---

## 🔬 Scientific Background

This implementation is based on peer-reviewed research in remote photoplethysmography:

- Poh et al. "Non-contact, automated cardiac pulse measurements using video imaging and blind source separation"
- Verkruysse et al. "Remote plethysmographic imaging using ambient light"
- de Haan & Jeanne "Robust pulse rate from chrominance-based rPPG"

---

## 📋 Roadmap

- [ ] Heart rate variability (HRV) analysis
- [ ] Respiratory rate detection
- [ ] Multiple face tracking
- [ ] Mobile native app (React Native)
- [ ] Health platform integrations (Apple Health, Google Fit)
- [ ] Advanced artifact rejection
- [ ] Machine learning-based accuracy improvements

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

---

## ⚠️ Disclaimer

This software is for **educational and research purposes only**. It is **not intended for medical diagnosis or treatment**. Always consult healthcare professionals for medical advice.

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/nausherwannasir/Vital-Sign/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nausherwannasir/Vital-Sign/discussions)
- **Documentation**: [API Docs](API_DOCUMENTATION.md) | [Architecture](ARCHITECTURE.md)

---

**⭐ If you find this project useful, please consider giving it a star!**