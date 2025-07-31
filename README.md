# Contactless Heart Rate Monitor

A real-time contactless heart rate monitoring system using remote photoplethysmography (rPPG) technology. The system detects heart rate through webcam video analysis of subtle color changes in facial skin caused by blood circulation.

## 🚀 Features

- **Real-time Heart Rate Detection**: Contactless BPM measurement using webcam
- **Dual Frontend Options**: 
  - Classic HTML/JS interface for simplicity
  - Modern React UI with Tailwind CSS and animations
- **MediaPipe Integration**: Robust face detection and landmark tracking
- **Signal Processing**: Advanced filtering and detrending for accurate measurements
- **Lighting Quality Assessment**: Automatic lighting condition evaluation
- **RESTful API**: Flask backend with JSON API endpoints

## 🏗️ Architecture

```
├── backend/           # Flask API server
│   ├── app.py        # Main Flask application
│   └── requirements.txt
├── frontend/         # Classic HTML/JS interface
│   ├── index.html    # Main page
│   ├── css/styles.css
│   └── js/rppg.js    # Core rPPG implementation
├── my-vitals-ui/     # Modern React interface
│   ├── src/
│   │   ├── App.jsx   # Main React component
│   │   ├── components/
│   │   └── hooks/    # Custom React hooks
│   └── package.json
└── README.md
```

## 🔬 How It Works

1. **Face Detection**: MediaPipe Face Mesh detects facial landmarks
2. **ROI Extraction**: Extracts regions of interest (forehead, cheeks, nose)
3. **Color Analysis**: Analyzes green channel pixel values over time
4. **Signal Processing**: Applies detrending and bandpass filtering
5. **Frequency Analysis**: Uses Welch's method for power spectral density
6. **BPM Calculation**: Identifies dominant frequency in physiological range (48-180 BPM)

## ⚙️ Setup Instructions

### Prerequisites

- Python 3.8+
- Node.js 16+ (for React UI)
- Modern web browser with webcam access
- Good lighting conditions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the Flask server:
```bash
python app.py
```

The backend will be available at `http://localhost:3000`

### Frontend Options

#### Option 1: Classic HTML/JS Interface

1. With the backend running, open your browser to:
```
http://localhost:3000
```

2. Allow webcam access when prompted
3. Position your face in the video frame
4. Wait for heart rate measurements to appear

#### Option 2: Modern React Interface

1. Navigate to the React UI directory:
```bash
cd my-vitals-ui
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to the displayed local URL (typically `http://localhost:5173`)

## 📊 API Documentation

### POST /predict

Analyzes a signal array and returns heart rate prediction.

**Request:**
```json
{
  "signal": [0.123, 0.145, 0.132, ...] // Array of normalized green channel values
}
```

**Response:**
```json
{
  "bpm": 72.5  // Heart rate in beats per minute, null if insufficient data
}
```

**Status Codes:**
- `200`: Successful prediction
- `400`: Invalid signal data (less than 50 samples)

### GET /

Serves the classic frontend interface.

## 🛠️ Technical Details

### Signal Processing Pipeline

1. **Detrending**: Removes DC component and linear trends
2. **Bandpass Filter**: 4th-order Butterworth filter (0.8-3.0 Hz)
3. **Spectral Analysis**: Welch's method with 128-sample segments
4. **Peak Detection**: Identifies maximum power in physiological range

### Performance Considerations

- **Buffer Size**: 150 frames (~5 seconds at 30 FPS)
- **Update Frequency**: 1 Hz for real-time feedback
- **ROI Strategy**: Multiple facial regions for robust signal extraction
- **Lighting Assessment**: Automatic quality feedback

## 🔧 Configuration

### Backend Configuration

Modify `app.py` for custom settings:
- `fs=30`: Sampling frequency (FPS)
- `bufSize=150`: Signal buffer length
- Port and host settings in `app.run()`

### Frontend Configuration

Modify `rppg.js` for custom settings:
- Video resolution: `{width:320,height:240}`
- MediaPipe confidence thresholds
- ROI extraction parameters

## 🚨 Troubleshooting

### Common Issues

1. **"No webcam access"**: Ensure HTTPS or localhost, check browser permissions
2. **"Poor lighting"**: Use well-lit environment, avoid backlighting
3. **"Unstable readings"**: Keep head still, ensure face is clearly visible
4. **"Connection errors"**: Verify backend is running on port 3000

### Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Safari (iOS/macOS)
- ❌ Internet Explorer

## 🔒 Privacy & Security

- **Local Processing**: All video processing happens locally
- **No Data Storage**: No video or biometric data is stored
- **HTTPS Required**: For production deployment, use HTTPS
- **Webcam Permissions**: Users must explicitly grant camera access

## 📈 Future Enhancements

- [ ] Heart rate variability analysis
- [ ] Multiple face tracking
- [ ] Mobile app development
- [ ] Integration with health platforms
- [ ] Advanced artifact rejection
- [ ] Respiratory rate detection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is provided for educational and research purposes. Please ensure compliance with local regulations regarding medical devices and health data.

## 🔬 Scientific Background

This implementation is based on research in remote photoplethysmography:

- Ming-Zher Poh et al. "Non-contact, automated cardiac pulse measurements using video imaging and blind source separation"
- Wim Verkruysse et al. "Remote plethysmographic imaging using ambient light"
- Gerard de Haan et al. "Robust pulse rate from chrominance-based rPPG"

## ⚠️ Medical Disclaimer

This software is for educational and research purposes only. It is not intended for medical diagnosis or treatment. Always consult healthcare professionals for medical advice.