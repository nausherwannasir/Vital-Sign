import React, { useRef, useEffect } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import PropTypes from 'prop-types';

/**
 * VideoFeed component for displaying webcam video with facial landmark overlay
 *
 * @param {Object} props - Component props
 * @param {string} props.className - CSS classes to apply
 * @param {Function} props.onFrameData - Callback receiving per-frame { r, g, b, brightness }
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
      ROI_SCALE: 0.15, // larger skin patches average out noise -> stronger pulse
    };

    // Initialize face mesh. Assets are bundled locally (see vite.config.js) and
    // served from our own origin, so the app has no runtime CDN dependency.
    const faceMesh = new FaceMesh({
      locateFile: (file) => `/mediapipe/face_mesh/${file}`,
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

      // Faint landmark mesh for visual feedback.
      overlayCtx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      landmarks.forEach(({ x, y }) => {
        overlayCtx.beginPath();
        overlayCtx.arc(x * overlayCanvas.width, y * overlayCanvas.height, 0.9, 0, 2 * Math.PI);
        overlayCtx.fill();
      });

      // Highlight the three ROIs actually sampled (forehead, nose, chin) so the
      // mask reads as intentional and shows what's being measured.
      const { centers, roiSize } = faceRegions(landmarks, CONFIG);
      overlayCtx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
      overlayCtx.fillStyle = 'rgba(34, 197, 94, 0.15)';
      overlayCtx.lineWidth = 2;
      centers.forEach(({ x, y }) => {
        const s = roiSize * 2;
        overlayCtx.beginPath();
        overlayCtx.rect(x - roiSize, y - roiSize, s, s);
        overlayCtx.fill();
        overlayCtx.stroke();
      });

      // Extract rPPG signal if callback is provided
      if (onFrameData) {
        try {
          onFrameData(extractRPPGSignal(landmarks, video, processingCtx, CONFIG));
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

      {/* Overlay canvas for landmarks. Mirrored to match the selfie-flipped
          video so the mesh lands on the face (MediaPipe coords are unmirrored). */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none rounded-lg"
        width={640}
        height={480}
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* Hidden canvas for video frame capture */}
      <canvas ref={canvasRef} className="hidden" width={640} height={480} />

      {/* Hidden processing canvas for ROI analysis */}
      <canvas ref={processingCanvasRef} className="hidden" width={64} height={64} />
    </div>
  );
}

/**
 * The three skin ROIs (forehead, nose, chin) in video-pixel coordinates, plus
 * their half-size. Shared by the overlay (to draw the mask) and the signal
 * extraction (to sample), so they always agree.
 *
 * @param {Array} landmarks - Facial landmark coordinates (normalized 0-1)
 * @param {Object} config - Configuration object
 * @returns {{centers: {x: number, y: number}[], roiSize: number}}
 */
function faceRegions(landmarks, config) {
  const leftEye = landmarks[33]; // Left eye outer corner
  const rightEye = landmarks[263]; // Right eye outer corner
  const faceWidth = (rightEye.x - leftEye.x) * config.VIDEO_WIDTH;
  const roiSize = faceWidth * config.ROI_SCALE;

  const centers = [
    // Forehead
    {
      x: ((landmarks[19].x + landmarks[24].x) / 2) * config.VIDEO_WIDTH,
      y: ((landmarks[19].y + landmarks[24].y) / 2) * config.VIDEO_HEIGHT - faceWidth * 0.1,
    },
    // Nose
    { x: landmarks[2].x * config.VIDEO_WIDTH, y: landmarks[2].y * config.VIDEO_HEIGHT },
    // Chin
    { x: landmarks[14].x * config.VIDEO_WIDTH, y: landmarks[14].y * config.VIDEO_HEIGHT },
  ];

  return { centers, roiSize };
}

/**
 * Extract rPPG signal from facial landmarks
 *
 * @param {Array} landmarks - Facial landmark coordinates
 * @param {HTMLVideoElement} video - Video element
 * @param {CanvasRenderingContext2D} ctx - Processing canvas context
 * @param {Object} config - Configuration object
 * @returns {Object} Per-frame mean { r, g, b, brightness }, each in [0, 1]
 */
function extractRPPGSignal(landmarks, video, ctx, config) {
  const { centers: regions, roiSize } = faceRegions(landmarks, config);

  let totalRed = 0;
  let totalGreen = 0;
  let totalBlue = 0;
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

    let regionRed = 0;
    let regionGreen = 0;
    let regionBlue = 0;
    let regionBrightness = 0;
    const pixelCount = imageData.length / 4;

    // Analyze pixels
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];

      regionRed += r;
      regionGreen += g;
      regionBlue += b;
      regionBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    }

    totalRed += regionRed / pixelCount / 255;
    totalGreen += regionGreen / pixelCount / 255;
    totalBlue += regionBlue / pixelCount / 255;
    totalBrightness += regionBrightness / pixelCount / 255;
    validRegions++;
  });

  if (validRegions === 0) {
    return { r: 0, g: 0, b: 0, brightness: 0 };
  }
  return {
    r: totalRed / validRegions,
    g: totalGreen / validRegions,
    b: totalBlue / validRegions,
    brightness: totalBrightness / validRegions,
  };
}

VideoFeed.propTypes = {
  className: PropTypes.string,
  onFrameData: PropTypes.func,
};
