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
    rgbBuffers: {               // Circular buffers for RGB channels
        r: [],
        g: [],
        b: []
    },
    isProcessing: false,        // Processing flag to prevent overlapping requests
    faceDetected: false,        // Current face detection status
    lastBpmUpdate: 0,          // Timestamp of last BPM update
    skinMask: null             // Skin segmentation mask
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
        
        // Improved ROI selection for better skin segmentation
        const skinRegions = extractSkinRegions(landmarks, faceWidth);
        
        let totalRGB = { r: 0, g: 0, b: 0 };
        let totalBrightness = 0;
        let validPixels = 0;
        
        // Process each skin region
        skinRegions.forEach(region => {
            const rgbValues = extractRGBFromRegion(region, video, ctx);
            if (rgbValues) {
                // Apply skin color filtering
                const filteredRGB = applySkinFilter(rgbValues);
                
                totalRGB.r += filteredRGB.r * filteredRGB.weight;
                totalRGB.g += filteredRGB.g * filteredRGB.weight;
                totalRGB.b += filteredRGB.b * filteredRGB.weight;
                totalBrightness += filteredRGB.brightness * filteredRGB.weight;
                validPixels += filteredRGB.weight;
            }
        });
        
        // Calculate weighted average values
        if (validPixels > 0) {
            const meanR = totalRGB.r / validPixels;
            const meanG = totalRGB.g / validPixels;
            const meanB = totalRGB.b / validPixels;
            const meanBrightness = totalBrightness / validPixels;
            
            // Update RGB signal buffers (circular buffers)
            state.rgbBuffers.r.push(meanR);
            state.rgbBuffers.g.push(meanG);
            state.rgbBuffers.b.push(meanB);
            
            // Maintain buffer size
            ['r', 'g', 'b'].forEach(channel => {
                if (state.rgbBuffers[channel].length > CONFIG.BUFFER_SIZE) {
                    state.rgbBuffers[channel].shift();
                }
            });
            
            // Update lighting quality indicator
            lightEl.textContent = meanBrightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting';
            
            // Log buffer status for debugging
            if (state.rgbBuffers.r.length % 30 === 0) { // Log every ~1 second
                console.log(`RGB buffers: ${state.rgbBuffers.r.length}/${CONFIG.BUFFER_SIZE} samples`);
            }
        }
        
    } catch (error) {
        console.error('Error processing face mesh results:', error);
        lightEl.textContent = 'Processing error';
    }
}

/**
 * Extract optimized skin regions from facial landmarks
 * 
 * @param {Array} landmarks - Facial landmark points
 * @param {number} faceWidth - Width of detected face
 * @returns {Array} Array of skin region definitions
 */
function extractSkinRegions(landmarks, faceWidth) {
    const regions = [];
    const roiSize = faceWidth * CONFIG.ROI_SCALE;
    
    // Forehead region (most reliable for rPPG)
    const foreheadCenter = {
        x: ((landmarks[9].x + landmarks[10].x) / 2) * CONFIG.VIDEO_WIDTH,
        y: ((landmarks[9].y + landmarks[10].y) / 2) * CONFIG.VIDEO_HEIGHT - faceWidth * 0.15
    };
    regions.push({
        x: foreheadCenter.x,
        y: foreheadCenter.y,
        size: roiSize * 1.2, // Larger forehead region
        weight: 3.0  // Higher weight for forehead
    });
    
    // Left cheek region
    const leftCheek = {
        x: landmarks[116].x * CONFIG.VIDEO_WIDTH,
        y: landmarks[116].y * CONFIG.VIDEO_HEIGHT
    };
    regions.push({
        x: leftCheek.x,
        y: leftCheek.y,
        size: roiSize,
        weight: 2.0
    });
    
    // Right cheek region
    const rightCheek = {
        x: landmarks[345].x * CONFIG.VIDEO_WIDTH,
        y: landmarks[345].y * CONFIG.VIDEO_HEIGHT
    };
    regions.push({
        x: rightCheek.x,
        y: rightCheek.y,
        size: roiSize,
        weight: 2.0
    });
    
    // Nose bridge (secondary region)
    const noseBridge = {
        x: landmarks[6].x * CONFIG.VIDEO_WIDTH,
        y: landmarks[6].y * CONFIG.VIDEO_HEIGHT
    };
    regions.push({
        x: noseBridge.x,
        y: noseBridge.y,
        size: roiSize * 0.8,
        weight: 1.0
    });
    
    return regions;
}

/**
 * Extract RGB values from a specific region
 * 
 * @param {Object} region - Region definition with x, y, size, weight
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {Object|null} RGB values and metadata
 */
function extractRGBFromRegion(region, video, ctx) {
    try {
        // Calculate region bounds with boundary checking
        const halfSize = region.size / 2;
        const x1 = Math.max(0, Math.floor(region.x - halfSize));
        const y1 = Math.max(0, Math.floor(region.y - halfSize));
        const width = Math.min(CONFIG.VIDEO_WIDTH - x1, Math.floor(region.size));
        const height = Math.min(CONFIG.VIDEO_HEIGHT - y1, Math.floor(region.size));
        
        // Skip invalid regions
        if (width <= 0 || height <= 0) return null;
        
        // Extract region to canvas
        ctx.drawImage(video, x1, y1, width, height, 0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE);
        const imageData = ctx.getImageData(0, 0, CONFIG.CANVAS_SIZE, CONFIG.CANVAS_SIZE).data;
        
        let r_sum = 0, g_sum = 0, b_sum = 0;
        let brightness_sum = 0;
        let valid_pixels = 0;
        
        // Analyze pixels with skin color filtering
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            // Basic skin color filter in RGB space
            if (isSkinColor(r, g, b)) {
                r_sum += r;
                g_sum += g;
                b_sum += b;
                brightness_sum += 0.299 * r + 0.587 * g + 0.114 * b;
                valid_pixels++;
            }
        }
        
        if (valid_pixels === 0) return null;
        
        return {
            r: (r_sum / valid_pixels) / 255,
            g: (g_sum / valid_pixels) / 255,
            b: (b_sum / valid_pixels) / 255,
            brightness: (brightness_sum / valid_pixels) / 255,
            weight: region.weight * (valid_pixels / (CONFIG.CANVAS_SIZE * CONFIG.CANVAS_SIZE))
        };
        
    } catch (error) {
        console.error('Error extracting RGB from region:', error);
        return null;
    }
}

/**
 * Check if a pixel represents skin color
 * 
 * @param {number} r - Red channel value (0-255)
 * @param {number} g - Green channel value (0-255)
 * @param {number} b - Blue channel value (0-255)
 * @returns {boolean} True if pixel is likely skin
 */
function isSkinColor(r, g, b) {
    // Convert to normalized values
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    
    // Skin color constraints in RGB space
    // Based on research by Kakumanu et al. (2007)
    const minR = 0.35, maxR = 1.0;
    const minG = 0.25, maxG = 0.85;
    const minB = 0.15, maxB = 0.75;
    
    // Basic RGB constraints
    if (rNorm < minR || rNorm > maxR) return false;
    if (gNorm < minG || gNorm > maxG) return false;
    if (bNorm < minB || bNorm > maxB) return false;
    
    // Additional constraints
    if (rNorm <= gNorm) return false;  // R should be > G for skin
    if (rNorm <= bNorm) return false;  // R should be > B for skin
    
    // Avoid very dark or very bright pixels
    const brightness = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;
    if (brightness < 0.2 || brightness > 0.95) return false;
    
    return true;
}

/**
 * Apply additional skin filtering and quality assessment
 * 
 * @param {Object} rgbValues - RGB values from region
 * @returns {Object} Filtered RGB values with quality weight
 */
function applySkinFilter(rgbValues) {
    // Adaptive quality weighting based on signal characteristics
    let qualityWeight = rgbValues.weight;
    
    // Prefer moderate brightness levels
    const brightness = rgbValues.brightness;
    if (brightness >= 0.3 && brightness <= 0.8) {
        qualityWeight *= 1.2;
    } else if (brightness < 0.2 || brightness > 0.9) {
        qualityWeight *= 0.5;
    }
    
    // Prefer balanced color ratios typical of skin
    const rg_ratio = rgbValues.r / (rgbValues.g + 1e-8);
    const rb_ratio = rgbValues.r / (rgbValues.b + 1e-8);
    
    if (rg_ratio >= 1.1 && rg_ratio <= 1.6 && rb_ratio >= 1.2 && rb_ratio <= 2.0) {
        qualityWeight *= 1.3;  // Good skin color ratios
    } else {
        qualityWeight *= 0.8;  // Less ideal ratios
    }
    
    return {
        r: rgbValues.r,
        g: rgbValues.g,
        b: rgbValues.b,
        brightness: rgbValues.brightness,
        weight: qualityWeight
    };
}

/**
 * Periodically compute and update heart rate display
 */
async function updateHeartRate() {
    // Skip if insufficient data or already processing
    if (state.rgbBuffers.r.length < CONFIG.BUFFER_SIZE || state.isProcessing) {
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
        // Prepare RGB signals for analysis
        const rgbSignals = {
            r: [...state.rgbBuffers.r], // Create copies to avoid race conditions
            g: [...state.rgbBuffers.g],
            b: [...state.rgbBuffers.b]
        };
        
        // Validate signal quality
        const signalStds = {
            r: calculateStandardDeviation(rgbSignals.r),
            g: calculateStandardDeviation(rgbSignals.g),
            b: calculateStandardDeviation(rgbSignals.b)
        };
        
        const avgStd = (signalStds.r + signalStds.g + signalStds.b) / 3;
        
        if (avgStd < 0.001) {
            console.warn('Signals appear too stable, possible motion artifact');
            bpmEl.textContent = 'Stay still';
            return;
        }
        
        // Check signal quality and consistency
        const signalQuality = assessSignalQuality(rgbSignals);
        if (signalQuality < 0.3) {
            console.warn('Poor signal quality detected');
            bpmEl.textContent = 'Poor signal quality';
            return;
        }
        
        // Make API request with improved RGB data
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rgb_signals: rgbSignals
            }),
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
            console.log(`Heart rate detected: ${result.bpm.toFixed(1)} BPM (quality: ${signalQuality.toFixed(2)})`);
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

/**
 * Calculate standard deviation of a signal
 * 
 * @param {Array} signal - Input signal array
 * @returns {number} Standard deviation
 */
function calculateStandardDeviation(signal) {
    if (signal.length === 0) return 0;
    
    const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
    const variance = signal.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / signal.length;
    return Math.sqrt(variance);
}

/**
 * Assess overall signal quality for rPPG analysis
 * 
 * @param {Object} rgbSignals - RGB signal arrays
 * @returns {number} Quality score (0-1)
 */
function assessSignalQuality(rgbSignals) {
    let qualityScore = 0;
    
    // Check signal variance (should be moderate)
    const stds = {
        r: calculateStandardDeviation(rgbSignals.r),
        g: calculateStandardDeviation(rgbSignals.g),
        b: calculateStandardDeviation(rgbSignals.b)
    };
    
    const avgStd = (stds.r + stds.g + stds.b) / 3;
    if (avgStd > 0.001 && avgStd < 0.1) {
        qualityScore += 0.3;
    }
    
    // Check signal correlation (R and G should be correlated for skin)
    const correlation = calculateCorrelation(rgbSignals.r, rgbSignals.g);
    if (correlation > 0.5) {
        qualityScore += 0.3;
    }
    
    // Check signal smoothness (avoid high-frequency noise)
    const smoothness = calculateSmoothness(rgbSignals.g);
    if (smoothness > 0.7) {
        qualityScore += 0.2;
    }
    
    // Check if signals have expected skin color characteristics
    const meanR = rgbSignals.r.reduce((sum, val) => sum + val, 0) / rgbSignals.r.length;
    const meanG = rgbSignals.g.reduce((sum, val) => sum + val, 0) / rgbSignals.g.length;
    const meanB = rgbSignals.b.reduce((sum, val) => sum + val, 0) / rgbSignals.b.length;
    
    const rgRatio = meanR / (meanG + 1e-8);
    const rbRatio = meanR / (meanB + 1e-8);
    
    if (rgRatio > 1.0 && rgRatio < 2.0 && rbRatio > 1.0 && rbRatio < 2.5) {
        qualityScore += 0.2;
    }
    
    return Math.min(1.0, qualityScore);
}

/**
 * Calculate correlation between two signals
 * 
 * @param {Array} signal1 - First signal
 * @param {Array} signal2 - Second signal
 * @returns {number} Correlation coefficient
 */
function calculateCorrelation(signal1, signal2) {
    if (signal1.length !== signal2.length || signal1.length === 0) return 0;
    
    const mean1 = signal1.reduce((sum, val) => sum + val, 0) / signal1.length;
    const mean2 = signal2.reduce((sum, val) => sum + val, 0) / signal2.length;
    
    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;
    
    for (let i = 0; i < signal1.length; i++) {
        const diff1 = signal1[i] - mean1;
        const diff2 = signal2[i] - mean2;
        
        numerator += diff1 * diff2;
        denominator1 += diff1 * diff1;
        denominator2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denominator1 * denominator2);
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate signal smoothness (inverse of high-frequency content)
 * 
 * @param {Array} signal - Input signal
 * @returns {number} Smoothness score (0-1)
 */
function calculateSmoothness(signal) {
    if (signal.length < 3) return 0;
    
    let totalVariation = 0;
    for (let i = 1; i < signal.length - 1; i++) {
        const secondDerivative = Math.abs(signal[i-1] - 2*signal[i] + signal[i+1]);
        totalVariation += secondDerivative;
    }
    
    const avgVariation = totalVariation / (signal.length - 2);
    return Math.max(0, 1 - avgVariation * 100); // Normalize and invert
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
