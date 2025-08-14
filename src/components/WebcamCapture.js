'use client';
import { useRef, useState, useEffect, use, useCallback } from 'react';

export default function WebcamCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const abortRef = useRef(null);
    const resizeObsRef = useRef(null);

    const [emotion, setEmotion] = useState('N/A');
    const [probs, setProbs] = useState(null);
    const [box, setBox] = useState(null);
    const [loading, setLoading] = useState(false);
    const [auto, setAuto] = useState(false);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState(null);

    const setCanvasToVideoSize = useCallback(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (!canvas || !video) return;

        const dpr = window.devicePixelRatio || 1;
        const vw = video.clientWidth;
        const vh = video.clientHeight;

        canvas.style.width = `${vw}px`;
        canvas.style.height = `${vh}px`;

        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);

    }, []);

    const drawFrame = useCallback((result) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !videp) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.scale(dpr, dpr);
        ctx.drawImage(video, 0, 0, canvas.clientWidth, canvas.clientHeight);

        if (!result || result.error) return;

        const { bounding_box, probabilities, emotion: emo } = result;

        const scaleX = canvas.clientWidth / video.videoWidth || 1;
        const scaleY = canvas.clientHeight / video.videoHeight || 1;
        const x = bounding_box.x * scaleX;
        const y = bounding_box.y * scaleY;
        const w = bounding_box.w * scaleX;
        const h = bounding_box.h * scaleY;

        ctx.linewidth = 2;
        ctx.strokeStyle = '#FACC15'; //yellow-400 for bounding box
        ctx.strokeRect(x, y, w, h);

        ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI';
        const label = emo || 'Unknown';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#FACC15'; //yellow-400 for label background
        ctx.fillRect(x, y - 22, tw + 12, 20);
        ctx.fillStyle = '#111827'; //gray-900 for label text
        ctx.fillText(label, x + 6, y - 7);

        if (probabilities) {
            const entries = Object.entries(probabilities)
            .map(([k, v]) => [k.toUpperCase(), Number(v)])
            .sort((a, b) => b[1] - a[1]);

            let px = x + w + 16;
            let py = y;
            const barW = 120;
            const lineH = 16;
            const pad = 8;

            entries.forEach(([lbl, p]) => {
                const percent = Math.round(p * 100);
                // text
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(`${lbl} ${perfect}%`, px, py + 12);
                // bar
                ctx.fillStyle = '#22C55E'; // green-500
                ctx.fillRect(px + 100, py + 4, Math.max(1, (perfect / 100) * barW), 8);
                py += lineH + pad;;
            });
        }
    }, []);


    
    const captureAndSend = useCallback(async () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (!video || !canvas) return;

        // Draw current frame to an offscreen blob
        const ctx = canvas.getContext('2d');
        // Ensure we are drawing latest video frame
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Use an intermediate canvas to avoid overlay artifacts
        const snap = document.createElement('canvas');
        snap.width = video.videoWidth;
        snap.height = video.videoHeight;
        const snapCtx = snap.getContext('2d');
        snapCtx.drawImage(video, 0, 0, snap.width, snap.height);

        const blob = await new Promise((resolve) => snap.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) {
            setEmotion('Error: No image captured');
            return;
        }

        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');

        try {
            setLoading(true);
            setError('');
            abortRef.current?.abort();
            abortRef.current = new AbortController();

            const response = await fetch("https://emotion-backend-2ra4.onrender.com/predict", {
                    method: 'POST',
                    body: formData,
                    signal: abortRef.current.signal,
                });
            const data = await response.json();

            if (data.error) {
                setEmotion('No face detected');
                setProbs(null);
                setBox(null);
                drawFrame(null);
                return;
            }

            setEmotion(data.emotion || 'UNKNOWN');
            setProbs(data.probabilities || null);
            setBox(data.bounding_box || null);
            drawFrame(data);

            

        } catch (e) {
            if (e.name !== 'AbortError') {
                console.error(e);
                setError('Network error');
            }
        } finally {
            setLoading(false);
        }
    }, [drawFrame]);


    const loop = useCallback((tPrev = 0) => {
        const step = (tNow) => {
            if (!auto) return;
            if (tNow - tPrev > 1000) {
                captureAndSend();
                tPrev = tNow;
            }
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    }, [auto, captureAndSend]);

    useEffect(() => {
        let stream;

        const start = async () => {
            try {
                const constraints = {
                    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
                    audio: false,
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
                setCanvasToVideoSize();

                const list = await navigator.mediaDevices.enumerateDevices();
                const cams = list.filter((d) => d.kind === 'videoinput');
                setDevices(cams);

                const ro = new ResizeObserver(setCanvasToVideoSize);
                resizeObsRef.current = ro;
                ro.observe(videoRef.current);

                if (auto) loop();
            } catch (err) {
                console.error(e);
                setError('Camera permission denied or unavailable');
            }
        };
        start();

        return () => {
            abortRef.current?.abort();
            cancelAnimationFrame(rafRef.current);
            resizeObsRef.current?.disconnect();
            if (stream) stream.getTracks().forEach((track) => track.stop());
        };
    }, [deviceId, auto, loop, setCanvasToVideoSize]);

    const onManualCapture = async () => {
        if (auto) return;
        await captureAndSend();
    };

    const onChangeDevice = (e) => setDeviceId(e.target.value || null);

    return (
    <div className="mx-auto max-w-3xl w-full p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Real‑time Emotion Detection</h2>
        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <select
              value={deviceId || ''}
              onChange={onChangeDevice}
              className="border rounded px-2 py-1 text-sm"
              title="Select camera"
            >
              <option value="">Default camera</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>
              ))}
            </select>
          )}
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            Auto
          </label>
          <button
            onClick={onManualCapture}
            disabled={auto || loading}
            className={`px-3 py-1.5 rounded text-white text-sm ${
              auto ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title={auto ? 'Disable Auto to use' : 'Capture once'}
          >
            {loading ? 'Detecting…' : 'Detect Emotion'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 border border-red-300 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      <div className="relative w-full max-w-2xl aspect-video bg-black rounded overflow-hidden shadow">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          autoPlay
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none' }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-gray-700">
          <span className="text-sm">Detected Emotion:</span>{' '}
          <span className="text-lg font-semibold">{emotion}</span>
        </div>
        {probs && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {Object.entries(probs)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-20 uppercase text-gray-600">{k}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded">
                    <div
                      className="h-2 bg-green-500 rounded"
                      style={{ width: `${Math.round(v * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">{Math.round(v * 100)}%</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}