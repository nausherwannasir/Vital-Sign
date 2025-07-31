import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom React hook for remote photoplethysmography (rPPG) heart rate detection
 * 
 * @returns {Object} Hook state containing BPM, quality metrics, and utility functions
 */
export default function useRPPG() {
    const [bpm, setBpm] = useState(null);
    const [quality, setQuality] = useState('Initializing...');
    const [lighting, setLighting] = useState('Initializing...');
    const [isProcessing, setIsProcessing] = useState(false);
    const [signalStrength, setSignalStrength] = useState(0);
    
    // Refs for persistent state across renders
    const rgbBuffersRef = useRef({ r: [], g: [], b: [] });
    const processingRef = useRef(false);
    const lastUpdateRef = useRef(0);
    
    // Configuration constants
    const CONFIG = {
        BUFFER_SIZE: 150,
        UPDATE_INTERVAL: 1000,
        MIN_BRIGHTNESS: 0.2,
        MIN_SIGNAL_STD: 0.001,
        API_TIMEOUT: 5000
    };
    
    /**
     * Detrend signal by removing DC component
     */
    const detrend = useCallback((signal) => {
        if (!signal || signal.length === 0) return [];
        const mean = signal.reduce((sum, val) => sum + val, 0) / signal.length;
        return signal.map(val => val - mean);
    }, []);
    
    /**
     * Calculate signal quality metrics
     */
    const calculateSignalQuality = useCallback((signal) => {
        if (signal.length < 50) return 0;
        
        const std = Math.sqrt(
            signal.reduce((sum, val) => sum + val * val, 0) / signal.length
        );
        
        // Normalize standard deviation to 0-100 scale
        return Math.min(100, Math.max(0, std * 10000));
    }, []);
    
    /**
     * Process new RGB frame data from video
     */
    const processFrame = useCallback((rgbData, brightness) => {
        // Update lighting status
        setLighting(brightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting');
        
        // Add to RGB buffers (circular buffers)
        rgbBuffersRef.current.r.push(rgbData.r);
        rgbBuffersRef.current.g.push(rgbData.g);
        rgbBuffersRef.current.b.push(rgbData.b);
        
        // Maintain buffer sizes
        ['r', 'g', 'b'].forEach(channel => {
            if (rgbBuffersRef.current[channel].length > CONFIG.BUFFER_SIZE) {
                rgbBuffersRef.current[channel].shift();
            }
        });
        
        // Update signal strength indicator based on recent data
        const currentLength = rgbBuffersRef.current.r.length;
        if (currentLength >= 30) {
            const recentR = rgbBuffersRef.current.r.slice(-30);
            const recentG = rgbBuffersRef.current.g.slice(-30);
            const recentB = rgbBuffersRef.current.b.slice(-30);
            
            const strength = calculateSignalQuality({ r: recentR, g: recentG, b: recentB });
            setSignalStrength(strength * 100); // Convert to percentage
        }
        
        // Update quality based on buffer size and signal characteristics
        if (currentLength < CONFIG.BUFFER_SIZE) {
            setQuality(`Collecting data... ${currentLength}/${CONFIG.BUFFER_SIZE}`);
        } else {
            const fullSignalQuality = calculateSignalQuality(rgbBuffersRef.current);
            if (fullSignalQuality < 0.3) {
                setQuality('Poor signal - check lighting and stay still');
            } else if (fullSignalQuality < 0.6) {
                setQuality('Fair signal quality');
            } else {
                setQuality('Good signal quality');
            }
        }
    }, [calculateSignalQuality, CONFIG.BUFFER_SIZE, CONFIG.MIN_BRIGHTNESS]);
    
    /**
     * Compute heart rate from current signal buffer
     */
    const computeHeartRate = useCallback(async () => {
        // Rate limiting
        const now = Date.now();
        if (now - lastUpdateRef.current < CONFIG.UPDATE_INTERVAL || processingRef.current) {
            return;
        }
        
        // Check buffer size
        if (rgbBuffersRef.current.r.length < CONFIG.BUFFER_SIZE) {
            return;
        }
        
        processingRef.current = true;
        setIsProcessing(true);
        lastUpdateRef.current = now;
        
        try {
            // Prepare RGB signals
            const rgbSignals = {
                r: [...rgbBuffersRef.current.r],
                g: [...rgbBuffersRef.current.g],
                b: [...rgbBuffersRef.current.b]
            };
            
            // Validate signal quality
            const signalQuality = calculateSignalQuality(rgbSignals);
            
            if (signalQuality < 0.2) {
                setBpm(null);
                setQuality('Poor signal quality - please ensure good lighting and stay still');
                return;
            }
            
            // API request with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT);
            
            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ rgb_signals: rgbSignals }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('API error:', errorData);
                setBpm(null);
                setQuality(`Error: ${errorData.error || 'Unknown error'}`);
                return;
            }
            
            const result = await response.json();
            
            if (result.bpm !== null && result.bpm !== undefined) {
                setBpm(Math.round(result.bpm * 10) / 10); // Round to 1 decimal
                setQuality('Heart rate detected');
            } else {
                setBpm(null);
                setQuality(result.message || 'No heart rate detected');
            }
            
        } catch (error) {
            console.error('Heart rate computation failed:', error);
            setBpm(null);
            
            if (error.name === 'AbortError') {
                setQuality('Request timeout');
            } else if (error.message.includes('fetch')) {
                setQuality('Connection error');
            } else {
                setQuality('Processing error');
            }
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    }, [detrend, CONFIG.BUFFER_SIZE, CONFIG.UPDATE_INTERVAL, CONFIG.MIN_SIGNAL_STD, CONFIG.API_TIMEOUT]);
    
    // Set up periodic heart rate computation
    useEffect(() => {
        const interval = setInterval(computeHeartRate, CONFIG.UPDATE_INTERVAL);
        return () => clearInterval(interval);
    }, [computeHeartRate, CONFIG.UPDATE_INTERVAL]);
    
    // Reset function for clearing data
    const reset = useCallback(() => {
        rgbBuffersRef.current = { r: [], g: [], b: [] };
        setBpm(null);
        setQuality('Initializing...');
        setLighting('Initializing...');
        setSignalStrength(0);
        setIsProcessing(false);
    }, []);
    
    return {
        bpm,
        quality,
        lighting,
        isProcessing,
        signalStrength,
        bufferSize: rgbBuffersRef.current.r.length,
        maxBufferSize: CONFIG.BUFFER_SIZE,
        processFrame,
        reset
    };
}
