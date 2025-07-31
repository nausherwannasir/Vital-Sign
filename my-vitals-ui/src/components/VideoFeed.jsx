import React, { useRef, useEffect } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import PropTypes from 'prop-types';

/**
 * VideoFeed component for displaying webcam video with facial landmark overlay
 * 
 * @param {Object} props - Component props
 * @param {string} props.className - CSS classes to apply
 * @param {Function} props.onFrameData - Callback for processing frame data (greenValue, brightness)
 */
export default function VideoFeed({ className, onFrameData }) {
    const videoRef = useRef();
    const canvasRef = useRef();
    const overlayCanvasRef = useRef();
    const processingCanvasRef = useRef();

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const processingCanvas = processingCanvasRef.current;
        
        if (!video || !canvas || !overlayCanvas || !processingCanvas) return;

        const ctx = canvas.getContext('2d');
        const overlayCtx = overlayCanvas.getContext('2d');
        const processingCtx = processingCanvas.getContext('2d');

        // Configuration
        const CONFIG = {
            VIDEO_WIDTH: 640,
            VIDEO_HEIGHT: 480,
            PROCESSING_SIZE: 64,
            ROI_SCALE: 0.1
        };

        // Initialize face mesh
        const faceMesh = new FaceMesh({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        /**
         * Process face mesh detection results
         */
        faceMesh.onResults((results) => {
            // Clear overlay
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            
            if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
                return;
            }

            const landmarks = results.multiFaceLandmarks[0];

            // Draw facial landmarks for visual feedback
            landmarks.forEach(({ x, y }) => {
                overlayCtx.fillStyle = 'rgba(34, 197, 94, 0.6)';
                overlayCtx.beginPath();
                overlayCtx.arc(
                    x * overlayCanvas.width,
                    y * overlayCanvas.height,
                    1.5, 0, 2 * Math.PI
                );
                overlayCtx.fill();
            });

            // Extract rPPG signal if callback is provided
            if (onFrameData) {
                try {
                    const { rgbValues, brightness } = extractRPPGSignal(
                        landmarks, 
                        video, 
                        processingCtx, 
                        CONFIG
                    );
                    onFrameData(rgbValues, brightness);
                } catch (error) {
                    console.error('Error extracting rPPG signal:', error);
                }
            }
        });

        // Initialize camera
        const camera = new Camera(video, {
            onFrame: async () => {
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    await faceMesh.send({ image: video });
                }
            },
            width: CONFIG.VIDEO_WIDTH,
            height: CONFIG.VIDEO_HEIGHT
        });

        camera.start();

        // Cleanup function
        return () => {
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
            }
        };
    }, [onFrameData]);

    return (
        <div className={`${className} relative w-full`} style={{ maxWidth: 640 }}>
            {/* Main video element */}
            <video
                ref={videoRef}
                className="w-full h-auto rounded-lg"
                playsInline
                muted
                autoPlay
                style={{ transform: 'scaleX(-1)' }} // Mirror for natural selfie view
            />
            
            {/* Overlay canvas for landmarks */}
            <canvas
                ref={overlayCanvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none rounded-lg"
                width={640}
                height={480}
            />
            
            {/* Hidden canvas for video frame capture */}
            <canvas
                ref={canvasRef}
                className="hidden"
                width={640}
                height={480}
            />
            
            {/* Hidden processing canvas for ROI analysis */}
            <canvas
                ref={processingCanvasRef}
                className="hidden"
                width={64}
                height={64}
            />
        </div>
    );
}

/**
 * Extract rPPG signal from facial landmarks using improved skin segmentation
 * 
 * @param {Array} landmarks - Facial landmark coordinates
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Processing canvas context
 * @param {Object} config - Configuration object
 * @returns {Object} Extracted RGB values and brightness
 */
function extractRPPGSignal(landmarks, video, ctx, config) {
    // Calculate face width using eye corners
    const leftEye = landmarks[33];   // Left eye outer corner
    const rightEye = landmarks[263]; // Right eye outer corner
    const faceWidth = (rightEye.x - leftEye.x) * config.VIDEO_WIDTH;
    const roiSize = faceWidth * config.ROI_SCALE;

    // Improved regions of interest for better skin coverage
    const regions = [
        // Forehead region (most reliable for rPPG)
        {
            x: ((landmarks[9].x + landmarks[10].x) / 2) * config.VIDEO_WIDTH,
            y: ((landmarks[9].y + landmarks[10].y) / 2) * config.VIDEO_HEIGHT - faceWidth * 0.15,
            size: roiSize * 1.2,
            weight: 3.0
        },
        // Left cheek region
        {
            x: landmarks[116].x * config.VIDEO_WIDTH,
            y: landmarks[116].y * config.VIDEO_HEIGHT,
            size: roiSize,
            weight: 2.0
        },
        // Right cheek region
        {
            x: landmarks[345].x * config.VIDEO_WIDTH,
            y: landmarks[345].y * config.VIDEO_HEIGHT,
            size: roiSize,
            weight: 2.0
        },
        // Nose bridge (secondary region)
        {
            x: landmarks[6].x * config.VIDEO_WIDTH,
            y: landmarks[6].y * config.VIDEO_HEIGHT,
            size: roiSize * 0.8,
            weight: 1.0
        }
    ];

    let totalRGB = { r: 0, g: 0, b: 0 };
    let totalBrightness = 0;
    let totalWeight = 0;

    // Process each region with skin filtering
    regions.forEach(region => {
        const rgbData = extractRegionRGB(region, video, ctx, config);
        if (rgbData && rgbData.validPixels > 0) {
            const effectiveWeight = region.weight * rgbData.skinRatio;
            
            totalRGB.r += rgbData.r * effectiveWeight;
            totalRGB.g += rgbData.g * effectiveWeight;
            totalRGB.b += rgbData.b * effectiveWeight;
            totalBrightness += rgbData.brightness * effectiveWeight;
            totalWeight += effectiveWeight;
        }
    });

    if (totalWeight === 0) {
        return {
            rgbValues: { r: 0, g: 0, b: 0 },
            brightness: 0
        };
    }

    return {
        rgbValues: {
            r: totalRGB.r / totalWeight,
            g: totalRGB.g / totalWeight,
            b: totalRGB.b / totalWeight
        },
        brightness: totalBrightness / totalWeight
    };
}

/**
 * Extract RGB values from a specific facial region with skin filtering
 * 
 * @param {Object} region - Region definition
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} config - Configuration object
 * @returns {Object|null} RGB data with skin filtering
 */
function extractRegionRGB(region, video, ctx, config) {
    try {
        const halfSize = region.size / 2;
        const x1 = Math.max(0, Math.floor(region.x - halfSize));
        const y1 = Math.max(0, Math.floor(region.y - halfSize));
        const width = Math.min(config.VIDEO_WIDTH - x1, Math.floor(region.size));
        const height = Math.min(config.VIDEO_HEIGHT - y1, Math.floor(region.size));

        if (width <= 0 || height <= 0) return null;

        // Extract region to processing canvas
        ctx.drawImage(
            video, x1, y1, width, height,
            0, 0, config.PROCESSING_SIZE, config.PROCESSING_SIZE
        );

        const imageData = ctx.getImageData(0, 0, config.PROCESSING_SIZE, config.PROCESSING_SIZE).data;
        
        let r_sum = 0, g_sum = 0, b_sum = 0, brightness_sum = 0;
        let skinPixels = 0, totalPixels = 0;

        // Analyze each pixel with skin color filtering
        for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            
            totalPixels++;
            
            // Apply skin color filter
            if (isSkinPixel(r, g, b)) {
                r_sum += r;
                g_sum += g;
                b_sum += b;
                brightness_sum += 0.299 * r + 0.587 * g + 0.114 * b;
                skinPixels++;
            }
        }

        if (skinPixels === 0) return null;

        return {
            r: (r_sum / skinPixels) / 255,
            g: (g_sum / skinPixels) / 255,
            b: (b_sum / skinPixels) / 255,
            brightness: (brightness_sum / skinPixels) / 255,
            validPixels: skinPixels,
            skinRatio: skinPixels / totalPixels
        };

    } catch (error) {
        console.error('Error extracting region RGB:', error);
        return null;
    }
}

/**
 * Determine if a pixel represents skin color
 * 
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {boolean} True if pixel is likely skin
 */
function isSkinPixel(r, g, b) {
    // Normalize RGB values
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    
    // Skin color constraints based on research
    if (rNorm < 0.35 || rNorm > 1.0) return false;
    if (gNorm < 0.25 || gNorm > 0.85) return false;
    if (bNorm < 0.15 || bNorm > 0.75) return false;
    
    // Skin-specific constraints
    if (rNorm <= gNorm || rNorm <= bNorm) return false;
    
    // Brightness constraints
    const brightness = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;
    if (brightness < 0.2 || brightness > 0.95) return false;
    
    // Color ratio constraints
    const rg_ratio = rNorm / (gNorm + 1e-8);
    const rb_ratio = rNorm / (bNorm + 1e-8);
    
    if (rg_ratio < 1.1 || rg_ratio > 2.0) return false;
    if (rb_ratio < 1.2 || rb_ratio > 2.5) return false;
    
    return true;
}

VideoFeed.propTypes = {
    className: PropTypes.string,
    onFrameData: PropTypes.func
};
