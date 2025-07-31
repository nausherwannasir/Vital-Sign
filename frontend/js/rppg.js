/**
 * Remote Photoplethysmography (rPPG) Implementation
 * 
 * This module implements contactless heart rate detection using webcam video.
 * It analyzes subtle color changes in facial skin to estimate heart rate.
 * 
 * @author Heart Rate Monitor Team
 * @version 1.0.0
 */

// DOM element references
const video = document.getElementById('video');
const bpmEl = document.getElementById('bpm');
const lightEl = document.getElementById('lighting');

// Configuration constants
const CONFIG = {
    BUFFER_SIZE: 150,           // Signal buffer size (~5 seconds at 30 FPS)
    VIDEO_WIDTH: 320,           // Video capture width
    VIDEO_HEIGHT: 240,          // Video capture height
    CANVAS_SIZE: 64,            // ROI sampling canvas size
    UPDATE_INTERVAL: 1000,      // BPM update interval (ms)
    MIN_BRIGHTNESS: 0.2,        // Minimum acceptable brightness
    ROI_SCALE: 0.1             // ROI size as fraction of face width
};

// Global state
const state = {
    greenBuffer: [],            // Circular buffer for green channel values
    isProcessing: false,        // Processing flag to prevent overlapping requests
    faceDetected: false,        // Current face detection status
    lastBpmUpdate: 0           // Timestamp of last BPM update
};

// Create off-screen canvas for ROI processing
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
canvas.width = canvas.height = CONFIG.CANVAS_SIZE;

/**
 * Initialize webcam access with error handling
 */
async function initializeCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: CONFIG.VIDEO_WIDTH,
                height: CONFIG.VIDEO_HEIGHT,
                facingMode: 'user'  // Prefer front-facing camera
            }
        });
        video.srcObject = stream;
        console.log('Camera initialized successfully');
        
        // Update UI to show camera is ready
        bpmEl.textContent = 'Initializing...';
        lightEl.textContent = 'Initializing...';
        
    } catch (error) {
        console.error('Camera initialization failed:', error);
        
        // Provide user-friendly error messages
        let errorMessage = 'Camera access denied';
        if (error.name === 'NotFoundError') {
            errorMessage = 'No camera found';
        } else if (error.name === 'NotAllowedError') {
            errorMessage = 'Camera permission denied';
        } else if (error.name === 'NotReadableError') {
            errorMessage = 'Camera already in use';
        }
        
        bpmEl.textContent = 'Error';
        lightEl.textContent = errorMessage;
        alert(`Camera Error: ${errorMessage}\n\nPlease ensure:\n- Camera permissions are granted\n- No other app is using the camera\n- You're using HTTPS or localhost`);
    }
}

// Initialize camera
initializeCamera();

/**
 * Remove DC component and linear trends from signal
 * 
 * @param {number[]} array - Input signal array
 * @returns {number[]} Detrended signal
 */
function detrend(array) {
    if (!array || array.length === 0) return [];
    
    const mean = array.reduce((sum, value) => sum + value, 0) / array.length;
    return array.map(value => value - mean);
}

/**
 * Initialize MediaPipe Face Mesh for facial landmark detection
 */
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

// Configure face detection parameters
faceMesh.setOptions({
    maxNumFaces: 1,                    // Process only one face for performance
    minDetectionConfidence: 0.5,       // Minimum confidence for face detection
    minTrackingConfidence: 0.5         // Minimum confidence for face tracking
});

// Set up result processing callback
faceMesh.onResults(onFaceMeshResults);

/**
 * Initialize camera feed processing with MediaPipe
 */
const camera = new Camera(video, {
    onFrame: async () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            await faceMesh.send({image: video});
        }
    },
    width: CONFIG.VIDEO_WIDTH,
    height: CONFIG.VIDEO_HEIGHT
});

// Start camera processing
camera.start();

/**
 * Process MediaPipe face mesh results to extract rPPG signal
 * 
 * @param {Object} results - MediaPipe face mesh detection results
 */
function onFaceMeshResults(results) {
    // Reset face detection status
    state.faceDetected = false;
    
    // Check if face landmarks are detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        lightEl.textContent = 'No face detected';
        return;
    }
    
    state.faceDetected = true;
    const landmarks = results.multiFaceLandmarks[0];
    
    try {
        // Extract face width using eye corners (landmarks 33 and 263)
        const leftEye = landmarks[33];   // Left eye outer corner
        const rightEye = landmarks[263]; // Right eye outer corner
        const faceWidth = (rightEye.x - leftEye.x) * CONFIG.VIDEO_WIDTH;
        const roiPixels = faceWidth * CONFIG.ROI_SCALE;
        
        // Define regions of interest (ROI) for signal extraction
        const regions = [
            // Forehead region (between eyebrows, slightly above)
            {
                x: ((landmarks[19].x + landmarks[24].x) / 2) * CONFIG.VIDEO_WIDTH,
                y: ((landmarks[19].y + landmarks[24].y) / 2) * CONFIG.VIDEO_HEIGHT - faceWidth * 0.1
            },
            // Nose tip region
            {
                x: landmarks[2].x * CONFIG.VIDEO_WIDTH,
                y: landmarks[2].y * CONFIG.VIDEO_HEIGHT
            },
            // Chin region
            {
                x: landmarks[14].x * CONFIG.VIDEO_WIDTH,
                y: landmarks[14].y * CONFIG.VIDEO_HEIGHT
            }
        ];
        
        let totalGreen = 0;
        let totalBrightness = 0;
        let validRegions = 0;
        
        // Process each ROI
        regions.forEach(region => {
            // Calculate ROI bounds with boundary checking
            const x1 = Math.max(0, Math.floor(region.x - roiPixels));
            const y1 = Math.max(0, Math.floor(region.y - roiPixels));
            const width = Math.min(CONFIG.VIDEO_WIDTH - x1, Math.floor(2 * roiPixels));
            const height = Math.min(CONFIG.VIDEO_HEIGHT - y1, Math.floor(2 * roiPixels));
            
            // Skip invalid regions
            if (width <= 0 || height <= 0) return;
            
            // Extract ROI to canvas for pixel analysis
            ctx.drawImage(video, x1, y1, width, height, 0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
            const imageData = ctx.getImageData(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE).data;
            
            let regionGreen = 0;
            let regionBrightness = 0;
            const pixelCount = imageData.length / 4;
            
            // Analyze pixel values (RGBA format)
            for (let i = 0; i < imageData.length; i += 4) {
                const r = imageData[i];
                const g = imageData[i + 1];
                const b = imageData[i + 2];
                
                regionGreen += g;
                // Calculate luminance using standard weights
                regionBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
            }
            
            // Normalize values
            totalGreen += (regionGreen / pixelCount) / 255;
            totalBrightness += (regionBrightness / pixelCount) / 255;
            validRegions++;
        });
        
        // Calculate average values across all valid regions
        if (validRegions > 0) {
            const meanGreen = totalGreen / validRegions;
            const meanBrightness = totalBrightness / validRegions;
            
            // Update signal buffer (circular buffer)
            state.greenBuffer.push(meanGreen);
            if (state.greenBuffer.length > CONFIG.BUFFER_SIZE) {
                state.greenBuffer.shift();
            }
            
            // Update lighting quality indicator
            lightEl.textContent = meanBrightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting';
            
            // Log buffer status for debugging
            if (state.greenBuffer.length % 30 === 0) { // Log every ~1 second
                console.log(`Signal buffer: ${state.greenBuffer.length}/${CONFIG.BUFFER_SIZE} samples`);
            }
        }
        
    } catch (error) {
        console.error('Error processing face mesh results:', error);
        lightEl.textContent = 'Processing error';
    }
}

/**
 * Periodically compute and update heart rate display
 */
async function updateHeartRate() {
    // Skip if insufficient data or already processing
    if (state.greenBuffer.length < CONFIG.BUFFER_SIZE || state.isProcessing) {
        return;
    }
    
    // Check if we should skip this update (rate limiting)
    const now = Date.now();
    if (now - state.lastBpmUpdate < CONFIG.UPDATE_INTERVAL) {
        return;
    }
    
    state.isProcessing = true;
    state.lastBpmUpdate = now;
    
    try {
        // Prepare signal for analysis
        const signal = detrend([...state.greenBuffer]); // Create copy to avoid race conditions
        
        // Validate signal quality
        const signalStd = Math.sqrt(
            signal.reduce((sum, val) => sum + val * val, 0) / signal.length
        );
        
        if (signalStd < 0.001) {
            console.warn('Signal appears too stable, possible motion artifact');
            bpmEl.textContent = 'Stay still';
            return;
        }
        
        // Make API request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({signal: signal}),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server error:', errorData);
            bpmEl.textContent = errorData.error || 'Server error';
            return;
        }
        
        const result = await response.json();
        
        // Update UI based on result
        if (result.bpm !== null && result.bpm !== undefined) {
            bpmEl.textContent = result.bpm.toFixed(1);
            console.log(`Heart rate detected: ${result.bpm.toFixed(1)} BPM`);
        } else {
            bpmEl.textContent = result.message || 'No signal';
            console.log('No valid heart rate detected');
        }
        
    } catch (error) {
        console.error('Heart rate update failed:', error);
        
        if (error.name === 'AbortError') {
            bpmEl.textContent = 'Timeout';
        } else if (error instanceof TypeError && error.message.includes('fetch')) {
            bpmEl.textContent = 'Connection error';
        } else {
            bpmEl.textContent = 'Error';
        }
    } finally {
        state.isProcessing = false;
    }
}

// Start periodic heart rate updates
setInterval(updateHeartRate, CONFIG.UPDATE_INTERVAL);

/**
 * Initialize UI status indicators
 */
function initializeUI() {
    bpmEl.textContent = 'Initializing...';
    lightEl.textContent = 'Initializing...';
    
    // Add status indicator for debugging
    if (window.location.search.includes('debug=true')) {
        const debugInfo = document.createElement('div');
        debugInfo.id = 'debug-info';
        debugInfo.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; font-family: monospace; font-size: 12px;';
        document.body.appendChild(debugInfo);
        
        setInterval(() => {
            debugInfo.innerHTML = `
                Buffer: ${state.greenBuffer.length}/${CONFIG.BUFFER_SIZE}<br>
                Face: ${state.faceDetected ? 'Yes' : 'No'}<br>
                Processing: ${state.isProcessing ? 'Yes' : 'No'}
            `;
        }, 1000);
    }
}

// Initialize UI
initializeUI();
