const video = document.getElementById('video');
const bpmEl  = document.getElementById('bpm');
const lightEl = document.getElementById('lighting');
const bufSize = 150, greenBuf = [];
const c = document.createElement('canvas'), ctx = c.getContext('2d');
c.width=c.height=64;

navigator.mediaDevices.getUserMedia({video:{width:320,height:240}})
  .then(s=>video.srcObject=s).catch(e=>alert(e));

// Simple detrend
function detrend(arr){
  const m=arr.reduce((a,b)=>a+b)/arr.length;
  return arr.map(v=>v-m);
}

// MediaPipe setup
const faceMesh = new FaceMesh({
  locateFile: f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({maxNumFaces:1,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
faceMesh.onResults(onResults);

new Camera(video,{onFrame:async()=>await faceMesh.send({image:video}),width:320,height:240}).start();

function onResults(r){
  if(!r.multiFaceLandmarks) return;
  const lm=r.multiFaceLandmarks[0];
  const left=lm[33], right=lm[263];
  const faceW=(right.x-left.x)*320, rpx=faceW*0.1;
  const centers=[
    {x:((lm[19].x+lm[24].x)/2)*320, y:((lm[19].y+lm[24].y)/2)*240-faceW*0.1},
    {x:lm[2].x*320,y:lm[2].y*240},
    {x:lm[14].x*320,y:lm[14].y*240}
  ];
  let sumG=0, sumB=0;
  centers.forEach(c0=>{
    const x1=Math.max(0,c0.x-rpx)|0, y1=Math.max(0,c0.y-rpx)|0;
    const w=Math.min(320-x1,(2*rpx)|0), h=Math.min(240-y1,(2*rpx)|0);
    ctx.drawImage(video,x1,y1,w,h,0,0,64,64);
    const d=ctx.getImageData(0,0,64,64).data;
    let g=0, bright=0;
    for(let i=0;i<d.length;i+=4){
      g+=d[i+1];
      bright+=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    }
    sumG += g/(d.length/4)/255;
    sumB += bright/(d.length/4)/255;
  });
  const meanG=sumG/3, meanBright=sumB/3;
  greenBuf.push(meanG); if(greenBuf.length>bufSize) greenBuf.shift();
  lightEl.textContent = meanBright<0.2?"Poor":"OK";
}

setInterval(async()=>{
  if(greenBuf.length<bufSize) return;
  const sig=detrend(greenBuf);
  try{
    const r=await fetch('/predict',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({signal:sig})});
    const {bpm} = await r.json();
    bpmEl.textContent = bpm?bpm.toFixed(1):'—';
  }catch{ bpmEl.textContent='Err'; }
},1000);
