import WebcamCapture from '@/components/WebcamCapture';

export const metadata = {
  title: 'Emotion Detector',
  description: 'Real‑time emotion recognition via webcam',
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Emotion Detector</h1>
          <p className="text-gray-600">Allow camera access to begin.</p>
        </header>

        <WebcamCapture />

        <noscript className="block mt-6 text-sm text-red-600">
          This page requires JavaScript for webcam access.
        </noscript>
      </div>
    </main>
  );
}
