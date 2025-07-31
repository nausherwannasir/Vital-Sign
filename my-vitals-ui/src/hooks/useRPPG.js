import { useState, useEffect } from 'react';

export default function useRPPG() {
  const [bpm, setBpm]         = useState(null);
  const [quality, setQuality] = useState('—');
  const [lighting, setLighting] = useState('—');

  useEffect(() => {
    // stub: capture ROI frames from VideoFeed, compute greenBuf
    // call backend /predict, update states
  }, []);

  return { bpm, quality, lighting };
}
