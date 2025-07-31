import React, { useRef, useEffect } from 'react';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera }   from '@mediapipe/camera_utils';

export default function VideoFeed({ className }) {
  const videoRef  = useRef();
  const canvasRef = useRef();

  useEffect(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');

    const faceMesh = new FaceMesh({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
    });
    faceMesh.setOptions({
      maxNumFaces:1,
      minDetectionConfidence:0.5,
      minTrackingConfidence:0.5
    });
    faceMesh.onResults(({multiFaceLandmarks})=>{
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(!multiFaceLandmarks) return;
      multiFaceLandmarks[0].forEach(({x,y})=>{
        ctx.fillStyle = 'rgba(34,197,94,0.8)';
        ctx.beginPath();
        ctx.arc(x*canvas.width,y*canvas.height,2,0,2*Math.PI);
        ctx.fill();
      });
    });

    new Camera(video,{
      onFrame: async()=>await faceMesh.send({image:video}),
      width:640, height:480
    }).start();
  },[]);

  return (
    <div className={className + ' relative w-full'} style={{maxWidth:640}}>
      <video ref={videoRef} className="w-full h-auto" playsInline muted autoPlay/>
      <canvas ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              width={640} height={480}/>
    </div>
  );
}
