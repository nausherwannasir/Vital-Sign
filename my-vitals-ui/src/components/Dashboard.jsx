import React, { useState, useEffect } from 'react';
import useRPPG from '../hooks/useRPPG';

export default function Dashboard() {
  const { bpm, quality, lighting } = useRPPG();

  return (
    <div className="space-y-4">
      <div><span className="font-medium">BPM:</span> <span className="font-bold ml-2">{bpm||'—'}</span></div>
      <div><span className="font-medium">Quality:</span> <span className="ml-2">{quality}</span></div>
      <div><span className="font-medium">Lighting:</span> <span className="ml-2">{lighting}</span></div>
    </div>
  );
}
