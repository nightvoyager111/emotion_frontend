'use client';
import { useRef, useState, useEffect } from 'react';

export default function WebcamCapture() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const streamRef = useRef(null);

  const [emotion, setEmotion] = useState('N/A');
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');

  const startCamera = async () => {
    try {
      setError('');
      // Ask for permission on click
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;

      // Wait for real video dimensions
      await new Promise((res) => {
        if (video.readyState >= 1 && video.videoWidth) return res();
        video.onloadedmetadata = () => res();
      });
      await video.play();

      // Begin periodic capture (every 3s, like your original)
      intervalRef.current = setInterval(captureAndSend, 3000);
      setStarted(true);
    } catch (e) {
      console.error(e);
      if (e.name === 'NotAllowedError') setError('Camera permission denied.');
      else if (e.name === 'NotFoundError') setError('No camera found.');
      else setError('Unable to access camera.');
    }
  };

  const stopCamera = () => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStarted(false);
    setEmotion('N/A');
    // clear overlay
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,c.width,c.height);
    }
  };

  useEffect(() => () => stopCamera(), []); // cleanup on unmount

  const captureAndSend = async () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!video || !canvas) return;
    if (!video.videoWidth || !video.videoHeight) return; // not ready yet

    // Keep canvas backing store = video pixel size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) {
      console.error('Blob is null, skipping submission.');
      setEmotion('Error: No image captured');
      return;
    }

    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    try {
      const response = await fetch('https://emotion-backend-2ra4.onrender.com/predict', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        setEmotion('Network error');
        console.error('HTTP', response.status, response.statusText);
        return;
      }

      const data = await response.json();
      if (data.error) {
        setEmotion('No face detected');
        drawOverlay(null); // clear overlay frame
        return;
      }

      setEmotion(data.emotion || 'Unknown');
      drawOverlay(data);
    } catch (err) {
      setEmotion('Error');
      console.error(err);
    }
  };

  const drawOverlay = (data) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    // If no detection, just show the video frame (already drawn)
    if (!data || !data.bounding_box) return;

    const { x, y, w, h } = data.bounding_box;
    const probs = data.probabilities || {};
    const emo = (data.emotion || 'UNKNOWN').toUpperCase();

    // Draw box
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Label background
    ctx.fillStyle = 'yellow';
    ctx.font = '16px Arial';
    ctx.fillRect(x, y - 24, ctx.measureText(emo).width + 10, 20);
    ctx.fillStyle = 'black';
    ctx.fillText(emo, x + 5, y - 8);

    // Prob bars
    const labels = Object.keys(probs);
    let offsetY = 30;
    const baseX = x + w + 20;

    labels.forEach((label) => {
      const percent = Math.round(Number(probs[label]) * 100);
      const barWidth = (percent / 100) * 120;

      ctx.fillStyle = 'white';
      ctx.fillText(`${label.toUpperCase()} ${percent}%`, baseX, offsetY + 10);

      ctx.fillStyle = 'limegreen';
      ctx.fillRect(baseX + 100, offsetY, Math.max(2, barWidth), 10);

      offsetY += 20;
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-xl font-semibold text-yellow-500">Webcam Emotion Detection</h1>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-300 p-2 rounded">
          {error}
        </div>
      )}

      <div className="relative w-[500px]">
        <video ref={videoRef} autoPlay playsInline className="rounded shadow w-full" />
        {/* Make overlay canvas follow the video size in CSS */}
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-[500px] h-auto"
          style={{ pointerEvents: 'none' }}
        />
      </div>

      <div className="flex items-center gap-2">
        {!started ? (
          <button
            onClick={startCamera}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Camera
          </button>
        ) : (
          <>
            <button
              onClick={captureAndSend}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Detect Emotion
            </button>
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800"
            >
              Stop
            </button>
          </>
        )}
      </div>

      <p className="text-lg font-medium text-gray-800">
        Detected Emotion: {emotion}
      </p>
    </div>
  );
}