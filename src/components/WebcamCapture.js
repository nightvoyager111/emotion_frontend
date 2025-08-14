'use client';
import { useRef, useState, useEffect, use, useCallback } from 'react';

const backend_URL = 'https://emotion-backend-2ra4.onrender.com/predict';

export default function WebcamCapture() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const rafRef = useRef(null);
    const abortRef = useRef(null);
    const resizeObsRef = useRef(null);
    const streamRef = useRef(null);

    const [started, setStarted] = useState(false);
    const [auto, setAuto] = useState(true);
    const [loading, setLoading] = useState(false);
    const [emotion, setEmotion] = useState('N/A');
    const [probs, setProbs] = useState(null);
    const [box, setBox] = useState(null);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState([]);
    const [deviceId, setDeviceId] = useState('');

    const sizeCanvas = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const cssW = video.clientWidth || 640;
        const cssH = video.clientHeight || 360;

        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }, []);

    const drawOverlay = useCallback((data) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        // clear + reset transform
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // draw current video frame (nice backdrop under overlays)
        ctx.scale(dpr, dpr);
        ctx.drawImage(video, 0, 0, canvas.clientWidth, canvas.clientHeight);

        if (!data || data.error || !data.bounding_box) return;

        const { x, y, w, h } = data.bounding_box;
        const scaleX = (canvas.clientWidth  / (video.videoWidth  || canvas.clientWidth));
        const scaleY = (canvas.clientHeight / (video.videoHeight || canvas.clientHeight));
        const sx = x * scaleX, sy = y * scaleY, sw = w * scaleX, sh = h * scaleY;

        // box
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FACC15'; // yellow-400
        ctx.strokeRect(sx, sy, sw, sh);

        // label
        const label = (data.emotion || 'UNKNOWN').toUpperCase();
        ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, Segoe UI';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = '#FACC15';
        ctx.fillRect(sx, sy - 22, tw + 12, 18);
        ctx.fillStyle = '#111827'; // gray-900
        ctx.fillText(label, sx + 6, sy - 8);

        // probabilities list
        const entries = Object.entries(data.probabilities || {})
        .map(([k,v]) => [k.toUpperCase(), Number(v)])
        .sort((a,b) => b[1]-a[1]);

        const baseX = sx + sw + 16;
        let baseY = sy;
        const barW = 120;

        entries.forEach(([k, v], i) => {
            const pct = Math.round(v * 100);
            const yRow = baseY + i * 20;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(`${k} ${pct}%`, baseX, yRow + 12);
            ctx.fillStyle = '#22C55E';
            ctx.fillRect(baseX + 100, yRow + 4, Math.max(2, (pct/100) * barW), 8);
        });
    }, []);


    
    const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !started) return;
    if (!video.videoWidth || !video.videoHeight) return; // not ready yet

    // offscreen canvas to avoid overlay artifacts
    const snap = document.createElement('canvas');
    snap.width = video.videoWidth;
    snap.height = video.videoHeight;
    const sctx = snap.getContext('2d');
    sctx.drawImage(video, 0, 0, snap.width, snap.height);

    const blob = await new Promise((res) => snap.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) {
      setError('Failed to capture frame.');
      return;
    }

    const formData = new FormData();
    formData.append('file', blob, 'frame.jpg');

    try {
      setLoading(true);
      setError('');
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        body: formData,
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        setError(`Network ${res.status}`);
        setEmotion('Network error');
        drawOverlay(null);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setEmotion('No face detected');
        setProbs(null);
        setBox(null);
        drawOverlay(null);
        return;
      }

      // coerce numbers
      const probsObj = Object.fromEntries(
        Object.entries(data.probabilities || {}).map(([k,v]) => [k, Number(v)])
      );

      setEmotion(data.emotion || 'Unknown');
      setProbs(probsObj);
      setBox(data.bounding_box || null);
      drawOverlay({
        emotion: data.emotion,
        probabilities: probsObj,
        bounding_box: data.bounding_box
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        setEmotion('Network error');
        setError('Network error');
      }
    } finally {
      setLoading(false);
    }
  }, [started, drawOverlay]);

  // --- Auto loop (throttled ~1 req/sec) ---
  const startLoop = useCallback((tPrev = 0) => {
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

  // --- Start camera (permission + device selection) ---
  const startCamera = useCallback(async () => {
    try {
      setError('');
      // Enumerate devices first (after any user gesture, labels become available)
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all.filter(d => d.kind === 'videoinput');
      setDevices(cams);

      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;

      // wait for dimensions
      await new Promise(res => {
        if (video.readyState >= 1 && video.videoWidth) return res();
        video.onloadedmetadata = () => res();
      });
      await video.play();

      sizeCanvas();
      // observe resizes to keep canvas aligned
      const ro = new ResizeObserver(sizeCanvas);
      resizeObsRef.current = ro;
      ro.observe(video);

      setStarted(true);
      if (auto) startLoop();
    } catch (e) {
      console.error(e);
      if (e.name === 'NotAllowedError') {
        setError('Camera permission denied.');
      } else if (e.name === 'NotFoundError') {
        setError('No camera found.');
      } else {
        setError('Unable to access camera.');
      }
    }
  }, [deviceId, auto, sizeCanvas, startLoop]);

  const stopCamera = useCallback(() => {
    abortRef.current?.abort();
    cancelAnimationFrame(rafRef.current);
    resizeObsRef.current?.disconnect();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStarted(false);
    setEmotion('N/A');
    setProbs(null);
    setBox(null);
    setError('');
    // clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,canvas.width,canvas.height);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="mx-auto max-w-3xl w-full p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">Real‑time Emotion Detection</h2>

        <div className="flex items-center gap-2">
          {devices.length > 1 && (
            <select
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
              disabled={started}
              title={started ? 'Stop camera to switch' : 'Select camera'}
            >
              <option value="">Default camera</option>
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Camera'}
                </option>
              ))}
            </select>
          )}

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-blue-600"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              disabled={!started}
            />
            Auto
          </label>

          {!started ? (
            <button
              onClick={startCamera}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            >
              Start camera
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => captureAndSend()}
                disabled={auto || loading}
                className={`px-3 py-1.5 rounded text-white text-sm ${
                  auto ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
                title={auto ? 'Disable Auto to capture once' : 'Capture once'}
              >
                {loading ? 'Detecting…' : 'Detect once'}
              </button>
              <button
                onClick={stopCamera}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-800 text-white text-sm"
              >
                Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-300 p-2 rounded">
          {error}
        </div>
      )}

      {/* Video + overlay */}
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

      {/* Readouts */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="text-gray-700">
          <div className="text-sm">Detected Emotion:</div>
          <div className="text-xl font-semibold">{emotion}</div>
        </div>

        {probs && (
          <div className="flex-1 min-w-[260px] grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {Object.entries(probs)
              .sort((a,b) => b[1]-a[1])
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-20 uppercase text-gray-600">{k}</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded">
                    <div
                      className="h-2 bg-green-500 rounded"
                      style={{ width: `${Math.round(Number(v) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums">
                    {Math.round(Number(v) * 100)}%
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}