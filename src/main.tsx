import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";
import {
  RouterProvider,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { useStore } from "./store";

// Root route
const rootRoute = createRootRoute({
  component: () => (
    <div className="bg-gray-950 text-white min-h-dvh">
      <WebcamPage />
    </div>
  ),
});

// Webcam Page Component
function WebcamPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const segmenterRef = useRef<SelfieSegmentation | null>(null);
  const [segmentationLoading, setSegmentationLoading] = useState(true);

  const isWebcamActive = useStore((state) => state.isWebcamActive);
  const webcamError = useStore((state) => state.webcamError);
  const asciiOutput = useStore((state) => state.asciiOutput);
  const updateAppState = useStore((state) => state.updateAppState);
  const startWebcam = useStore((state) => state.startWebcam);
  const stopWebcam = useStore((state) => state.stopWebcam);
  const updateAsciiOutput = useStore((state) => state.updateAsciiOutput);
  const perfMetrics = useStore((state) => state.perfMetrics);
  const showPerfOverlay = useStore((state) => state.showPerfOverlay);
  const [windowSize, setWindowSize] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () =>
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const asciiFontSize = useMemo(() => {
    if (!asciiOutput) return 12;
    const lines = asciiOutput.split("\n");
    const cols = lines[0]?.length || 1;
    const rows = lines.length;
    const padding = 32; // 16px padding on each side
    const charWidth = (windowSize.w - padding) / cols;
    const charHeight = (windowSize.h - padding) / rows;
    return Math.max(
      4,
      Math.min(16, Math.floor(Math.min(charWidth / 0.6, charHeight)))
    );
  }, [asciiOutput, windowSize]);

  useEffect(() => {
    if (videoRef.current) {
      updateAppState({ videoRef: videoRef.current });
    }
  }, [updateAppState]);

  // Initialize MediaPipe Selfie Segmentation
  useEffect(() => {
    const initSegmentation = async () => {
      try {
        const selfieSegmentation = new SelfieSegmentation({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
          },
        });

        selfieSegmentation.setOptions({
          modelSelection: 1, // 0 for general, 1 for landscape (better quality)
          selfieMode: true,
        });

        // Set up callback to receive segmentation results
        selfieSegmentation.onResults((results) => {
          if (maskCanvasRef.current && results.segmentationMask) {
            const maskCtx = maskCanvasRef.current.getContext("2d");
            if (maskCtx) {
              maskCanvasRef.current.width = results.segmentationMask.width;
              maskCanvasRef.current.height = results.segmentationMask.height;
              maskCtx.drawImage(results.segmentationMask, 0, 0);
            }
          }
        });

        segmenterRef.current = selfieSegmentation;
        setSegmentationLoading(false);
      } catch (err) {
        console.error("Failed to initialize segmentation:", err);
        setSegmentationLoading(false);
      }
    };

    initSegmentation();
  }, []);

  // Capture and convert video frames to ASCII
  useEffect(() => {
    if (
      !isWebcamActive ||
      !videoRef.current ||
      !canvasRef.current ||
      !maskCanvasRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const maskCtx = maskCanvas.getContext("2d");

    if (!ctx || !maskCtx) return;

    let lastFrameTime = 0;
    const targetFrameMs = 33; // ~30fps
    let aspectChecked = false;

    const captureFrame = async (timestamp: number) => {
      // Skip frame if we're behind schedule
      if (timestamp - lastFrameTime < targetFrameMs) {
        animationFrameRef.current = requestAnimationFrame(captureFrame);
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Detect portrait and reduce asciiWidth once
        if (!aspectChecked) {
          aspectChecked = true;
          if (video.videoHeight > video.videoWidth) {
            updateAppState({ asciiWidth: 80 });
          }
        }

        const frameStart = performance.now();

        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        maskCanvas.width = video.videoWidth;
        maskCanvas.height = video.videoHeight;

        // Draw mirrored video frame to canvas (matches MediaPipe selfieMode mask)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0);
        ctx.restore();

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Apply segmentation if segmenter is ready
        let maskData: ImageData | undefined;
        let segTime = 0;
        if (segmenterRef.current && !segmentationLoading) {
          try {
            const segStart = performance.now();
            await segmenterRef.current.send({ image: video });
            maskData = maskCtx.getImageData(
              0,
              0,
              maskCanvas.width,
              maskCanvas.height
            );
            segTime = performance.now() - segStart;
          } catch (err) {
            console.error("Segmentation error:", err);
          }
        }

        // Convert to ASCII with optional mask
        const asciiStart = performance.now();
        updateAsciiOutput(imageData, maskData);
        const asciiTime = performance.now() - asciiStart;

        const frameTime = performance.now() - frameStart;
        lastFrameTime = timestamp;

        // Update perf metrics in store
        updateAppState({
          perfMetrics: {
            fps: Math.round(1000 / Math.max(frameTime, 1)),
            frameTimeMs: Math.round(frameTime * 10) / 10,
            segTimeMs: Math.round(segTime * 10) / 10,
            asciiTimeMs: Math.round(asciiTime * 10) / 10,
            resolution: `${video.videoWidth}x${video.videoHeight}`,
            gridSize: `${useStore.getState().asciiWidth}x${Math.floor(video.videoHeight / (Math.floor(video.videoWidth / useStore.getState().asciiWidth) * 2))}`,
          },
        });
      }

      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };

    animationFrameRef.current = requestAnimationFrame(captureFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isWebcamActive, segmentationLoading, updateAsciiOutput]);

  return (
    <div className="relative flex flex-col bg-black overflow-hidden h-dvh">
      {/* Full-screen ASCII Output */}
      <div className="absolute inset-0 flex items-center justify-center p-4 w-full h-full overflow-hidden">
        <pre
          className="text-green-400 font-mono whitespace-pre leading-none"
          style={{ fontSize: `${asciiFontSize}px` }}
        >
          {asciiOutput || "ASCII output will appear here..."}
        </pre>
      </div>

      {/* Hidden canvases for frame capture and segmentation */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={maskCanvasRef} className="hidden" />

      {/* Bottom Control Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
        {webcamError && (
          <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded mb-4">
            {webcamError}
          </div>
        )}
        {!isWebcamActive ? (
          <button
            onClick={startWebcam}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Start Webcam
          </button>
        ) : (
          <button
            onClick={stopWebcam}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            Stop Webcam
          </button>
        )}
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={() => updateAppState({ showPerfOverlay: !showPerfOverlay })}
          className="bg-gray-800/60 hover:bg-gray-700/80 text-gray-400 text-xs font-mono px-2 py-1 rounded transition"
        >
          {showPerfOverlay ? "Hide Stats" : "Show Stats"}
        </button>
        {showPerfOverlay && perfMetrics && (
          <div className="bg-black/70 text-green-300 font-mono text-xs px-3 py-2 rounded space-y-0.5">
            <div>FPS: {perfMetrics.fps}</div>
            <div>Frame: {perfMetrics.frameTimeMs}ms</div>
            <div>Seg: {perfMetrics.segTimeMs}ms</div>
            <div>ASCII: {perfMetrics.asciiTimeMs}ms</div>
            <div>Res: {perfMetrics.resolution}</div>
            <div>Grid: {perfMetrics.gridSize}</div>
          </div>
        )}
      </div>

      {/* Small Webcam Preview - Bottom Right Corner */}
      <div className="absolute bottom-8 right-8 z-10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="rounded-lg border-2 border-gray-700 max-w-[150px] max-h-[150px] object-contain scale-x-[-1]"
        />
      </div>
    </div>
  );
}

const routeTree = rootRoute;

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
