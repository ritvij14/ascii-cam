import {
  RouterProvider,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import React from "react";
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
  const isWebcamActive = useStore((state) => state.isWebcamActive);
  const webcamError = useStore((state) => state.webcamError);
  const asciiOutput = useStore((state) => state.asciiOutput);
  const updateAppState = useStore((state) => state.updateAppState);
  const startWebcam = useStore((state) => state.startWebcam);
  const stopWebcam = useStore((state) => state.stopWebcam);
  const perfMetrics = useStore((state) => state.perfMetrics);
  const showPerfOverlay = useStore((state) => state.showPerfOverlay);
  const cols = asciiOutput
    ? asciiOutput.indexOf("\n") || asciiOutput.length
    : 1;
  const rows = asciiOutput ? asciiOutput.split("\n").length : 1;

  return (
    <div className="relative flex flex-col bg-black overflow-hidden h-dvh">
      {/* Full-screen ASCII Output */}
      <div className="absolute inset-0 flex items-center justify-center p-4 w-full h-full overflow-hidden">
        <pre
          className="text-green-400 font-mono whitespace-pre leading-none"
          style={
            {
              "--cols": cols,
              "--rows": rows,
              fontSize:
                "clamp(4px, min(calc((100vw - 32px) / var(--cols) / 0.6), calc((100dvh - 32px) / var(--rows))), 16px)",
            } as React.CSSProperties
          }
        >
          {asciiOutput || "ASCII output will appear here..."}
        </pre>
      </div>

      {/* Hidden canvases for frame capture and segmentation */}
      <canvas
        ref={(el) => { if (el) updateAppState({ canvasRef: el }); }}
        className="hidden"
      />
      <canvas
        ref={(el) => { if (el) updateAppState({ maskCanvasRef: el }); }}
        className="hidden"
      />

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
          ref={(el) => { if (el) updateAppState({ videoRef: el }); }}
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
