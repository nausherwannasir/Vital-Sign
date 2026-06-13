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

    const overlayCtx = overlayCanvas.getContext('2d');
    const processingCtx = processingCanvas.getContext('2d');

    // Configuration
    const CONFIG = {
      VIDEO_WIDTH: 640,
      VIDEO_HEIGHT: 480,
      PROCESSING_SIZE: 64,
      ROI_SCALE: 0.1,
    };

    // Initialize face mesh
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
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
        overlayCtx.arc(x * overlayCanvas.width, y * overlayCanvas.height, 1.5, 0, 2 * Math.PI);
        overlayCtx.fill();
      });

      // Extract rPPG signal if callback is provided
      if (onFrameData) {
        try {
          const { greenValue, brightness } = extractRPPGSignal(
            landmarks,
            video,
            processingCtx,
            CONFIG
          );
          onFrameData(greenValue, brightness);
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
      height: CONFIG.VIDEO_HEIGHT,
    });

    camera.start();

    // Cleanup function
    return () => {
      camera.stop();
      faceMesh.close();
      if (video.srcObject) {
        video.srcObject.getTracks().forEach((track) => track.stop());
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
      <canvas ref={canvasRef} className="hidden" width={640} height={480} />

      {/* Hidden processing canvas for ROI analysis */}
      <canvas ref={processingCanvasRef} className="hidden" width={64} height={64} />
    </div>
  );
}

/**
 * Extract rPPG signal from facial landmarks
 *
 * @param {Array} landmarks - Facial landmark coordinates
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Processing canvas context
 * @param {Object} config - Configuration object
 * @returns {Object} Extracted green value and brightness
 */
function extractRPPGSignal(landmarks, video, ctx, config) {
  // Calculate face width using eye corners
  const leftEye = landmarks[33]; // Left eye outer corner
  const rightEye = landmarks[263]; // Right eye outer corner
  const faceWidth = (rightEye.x - leftEye.x) * config.VIDEO_WIDTH;
  const roiSize = faceWidth * config.ROI_SCALE;

  // Define regions of interest
  const regions = [
    // Forehead region
    {
      x: ((landmarks[19].x + landmarks[24].x) / 2) * config.VIDEO_WIDTH,
      y: ((landmarks[19].y + landmarks[24].y) / 2) * config.VIDEO_HEIGHT - faceWidth * 0.1,
    },
    // Nose region
    {
      x: landmarks[2].x * config.VIDEO_WIDTH,
      y: landmarks[2].y * config.VIDEO_HEIGHT,
    },
    // Chin region
    {
      x: landmarks[14].x * config.VIDEO_WIDTH,
      y: landmarks[14].y * config.VIDEO_HEIGHT,
    },
  ];

  let totalGreen = 0;
  let totalBrightness = 0;
  let validRegions = 0;

  // Process each region
  regions.forEach((region) => {
    const x1 = Math.max(0, Math.floor(region.x - roiSize));
    const y1 = Math.max(0, Math.floor(region.y - roiSize));
    const width = Math.min(config.VIDEO_WIDTH - x1, Math.floor(2 * roiSize));
    const height = Math.min(config.VIDEO_HEIGHT - y1, Math.floor(2 * roiSize));

    if (width <= 0 || height <= 0) return;

    // Extract ROI
    ctx.drawImage(
      video,
      x1,
      y1,
      width,
      height,
      0,
      0,
      config.PROCESSING_SIZE,
      config.PROCESSING_SIZE
    );

    const imageData = ctx.getImageData(0, 0, config.PROCESSING_SIZE, config.PROCESSING_SIZE).data;

    let regionGreen = 0;
    let regionBrightness = 0;
    const pixelCount = imageData.length / 4;

    // Analyze pixels
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];

      regionGreen += g;
      regionBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    totalGreen += regionGreen / pixelCount / 255;
    totalBrightness += regionBrightness / pixelCount / 255;
    validRegions++;
  });

  return {
    greenValue: validRegions > 0 ? totalGreen / validRegions : 0,
    brightness: validRegions > 0 ? totalBrightness / validRegions : 0,
  };
}

VideoFeed.propTypes = {
  className: PropTypes.string,
  onFrameData: PropTypes.func,
};
