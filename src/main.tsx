import { SelfieSegmentation } from "@mediapipe/selfie_segmentation";
import {
  RouterProvider,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { useStore } from "./store";

// Root route
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-gray-950 text-white">
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
          console.log(
            "Segmentation results received:",
            results.segmentationMask ? "Has mask" : "No mask"
          );
          if (maskCanvasRef.current && results.segmentationMask) {
            const maskCtx = maskCanvasRef.current.getContext("2d");
            if (maskCtx) {
              maskCanvasRef.current.width = results.segmentationMask.width;
              maskCanvasRef.current.height = results.segmentationMask.height;
              maskCtx.drawImage(results.segmentationMask, 0, 0);
              console.log(
                "Mask drawn to canvas:",
                maskCanvasRef.current.width,
                "x",
                maskCanvasRef.current.height
              );
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

    const captureFrame = async () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        maskCanvas.width = video.videoWidth;
        maskCanvas.height = video.videoHeight;

        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0);

        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Apply segmentation if segmenter is ready
        let maskData: ImageData | undefined;
        if (segmenterRef.current && !segmentationLoading) {
          try {
            // Send frame to segmentation
            await segmenterRef.current.send({ image: video });

            // Get the mask (drawn to maskCanvas by MediaPipe)
            maskData = maskCtx.getImageData(
              0,
              0,
              maskCanvas.width,
              maskCanvas.height
            );
          } catch (err) {
            console.error("Segmentation error:", err);
          }
        }

        // Convert to ASCII with optional mask
        updateAsciiOutput(imageData, maskData);
      }

      animationFrameRef.current = requestAnimationFrame(captureFrame);
    };

    captureFrame();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isWebcamActive, segmentationLoading, updateAsciiOutput]);

  return (
    <div className="relative flex flex-col min-h-screen bg-black overflow-hidden">
      {/* Full-screen ASCII Output */}
      <div className="absolute inset-0 flex items-center justify-center p-4 w-full h-full">
        <pre
          className="text-green-400 font-mono whitespace-pre"
          style={{ fontSize: "12px", lineHeight: "1" }}
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

      {/* Small Webcam Preview - Bottom Right Corner */}
      <div className="absolute bottom-8 right-8 z-10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="rounded-lg border-2 border-gray-700"
          style={{ width: "200px", height: "auto" }}
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
