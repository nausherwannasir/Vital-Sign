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
    const greenBufferRef = useRef([]);
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
     * Process new green channel value from video frame
     */
    const processFrame = useCallback((greenValue, brightness) => {
        // Update lighting status
        setLighting(brightness < CONFIG.MIN_BRIGHTNESS ? 'Poor lighting' : 'Good lighting');
        
        // Add to buffer (circular buffer)
        greenBufferRef.current.push(greenValue);
        if (greenBufferRef.current.length > CONFIG.BUFFER_SIZE) {
            greenBufferRef.current.shift();
        }
        
        // Update signal strength indicator
        const currentSignal = greenBufferRef.current.slice(-30); // Last 1 second
        const strength = calculateSignalQuality(currentSignal);
        setSignalStrength(strength);
        
        // Update quality based on buffer size and signal strength
        if (greenBufferRef.current.length < CONFIG.BUFFER_SIZE) {
            setQuality(`Collecting data... ${greenBufferRef.current.length}/${CONFIG.BUFFER_SIZE}`);
        } else if (strength < 10) {
            setQuality('Weak signal - stay still');
        } else if (strength < 30) {
            setQuality('Fair signal');
        } else {
            setQuality('Good signal');
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
        if (greenBufferRef.current.length < CONFIG.BUFFER_SIZE) {
            return;
        }
        
        processingRef.current = true;
        setIsProcessing(true);
        lastUpdateRef.current = now;
        
        try {
            // Prepare signal
            const signal = detrend([...greenBufferRef.current]);
            
            // Validate signal quality
            const signalStd = Math.sqrt(
                signal.reduce((sum, val) => sum + val * val, 0) / signal.length
            );
            
            if (signalStd < CONFIG.MIN_SIGNAL_STD) {
                setBpm(null);
                setQuality('Motion detected - please stay still');
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
                body: JSON.stringify({ signal }),
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
        greenBufferRef.current = [];
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
        bufferSize: greenBufferRef.current.length,
        maxBufferSize: CONFIG.BUFFER_SIZE,
        processFrame,
        reset
    };
}
