'use client';
import { useRef, useState, useEffect } from 'react';

export default function WebcamCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [emotion, setEmotion] = useState('N/A');
    
    useEffect(() => {
        let interval;

        async function enableCam() {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoRef.current.srcObject = stream;

            interval = setInterval(() => {
                CaptureAndSend();
            }, 3000); // Capture every 3 seconds
        }
        enableCam();
        return () => clearInterval(interval);
    }, []);
    
    const CaptureAndSend = async () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            if (!blob) {
                console.error('Blob is null, skipping submission.');
                setEmotion('Error: No image captured');
                return;
            }
            const formData = new FormData();
            formData.append('file', blob, 'frame.jpg');

            try {
                const response = await fetch("https://emotion-backend-2ra4.onrender.com/predict", {
                    method: 'POST',
                    body: formData,
                });

                const data = await response.json();
                if (data.error) {
                    setEmotion('No face detected');
                    return;
                }
                setEmotion(data.emotion || 'Unknown');
                drawOverlay(data);
            } catch (err) {
                setEmotion('Error');
                console.error(err);
            }
        }, 'image/jpeg');
    };

    const drawOverlay = (data) => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { x, y, w, h } = data.bounding_box;
        const probs = data.probabilities;
        const emotion = data.emotion;

        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = 'yellow';
        ctx.font = '16px Arial';
        ctx.fillRect(x, y - 24, ctx.measureText(emotion).width + 10, 20);
        ctx.fillStyle = 'black';
        ctx.fillText(emotion, x + 5, y - 8);

        const labels = Object.keys(probs);
        let offsetY = 30;
        const baseX = x + w + 20;

        labels.forEach((label) => {
            const percent = Math.round(probs[label] * 100);
            const barWidth = (percent / 100) * 100;

            ctx.fillStyle = 'white';
            ctx.fillText(`${label.toUpperCase()} ${percent}%`, baseX, offsetY + 10);

            ctx.fillStyle = 'limegreen';
            ctx.fillRect(baseX + 100, offsetY, barWidth, 10);

            offsetY += 20;
        });
    };

    
    return (
        <div className="flex flex-col items-center gap-4 mt-4">
            <div className="relative w-[300px]">
                <video ref={videoRef} autoPlay playsInline className="rounded shadow w-full absolute top-0 left-0 z-0" />
                <canvas ref={canvasRef} className="w-full h-auto absolute top-0 left-0 z-10 pointer-events-none" />
            </div>
            <button onClick={captureAndSend} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Detect Emotion
            </button>
            <p className="text-lg font-medium text-gray-800">Detected Emotion: {emotion}</p>
        </div>
    );
}