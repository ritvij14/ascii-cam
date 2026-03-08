import {
  RouterProvider,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";
import ReactDOM from "react-dom/client";
import "./index.css";
import { CHARACTER_SETS } from "./constants/character-sets";
import EmojiGrid from "./EmojiGrid";
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
  const asciiColor = useStore((state) => state.asciiColor);
  const asciiWidth = useStore((state) => state.asciiWidth);
  const selectedCharset = useStore((state) => state.selectedCharset);
  const colorMode = useStore((state) => state.colorMode);
  const coloredAsciiOutput = useStore((state) => state.coloredAsciiOutput);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const cols = asciiOutput
    ? asciiOutput.indexOf("\n") || asciiOutput.length
    : asciiWidth;
  const rows = asciiOutput ? asciiOutput.split("\n").length : 1;

  return (
    <div className="relative flex flex-col bg-black overflow-hidden h-dvh">
      {/* Full-screen ASCII Output */}
      <div className="absolute inset-0 flex items-center justify-center p-4 w-full h-full overflow-hidden">
        {colorMode === 'emoji' ? (
          <EmojiGrid />
        ) : (
          <pre
            className="font-mono whitespace-pre leading-none"
            style={
              {
                "--cols": cols,
                "--rows": rows,
                fontSize:
                  "clamp(4px, min(calc((100vw - 32px) / var(--cols) / 0.6), calc((100dvh - 32px) / var(--rows))), 16px)",
                color: colorMode === 'monochrome' ? asciiColor : undefined,
              } as React.CSSProperties
            }
            dangerouslySetInnerHTML={
              colorMode === 'color'
                ? { __html: coloredAsciiOutput || "ASCII output will appear here..." }
                : undefined
            }
          >
            {colorMode === 'monochrome' ? (asciiOutput || "ASCII output will appear here...") : undefined}
          </pre>
        )}
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

      {/* Bottom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        {/* Color picker panel (expands above) */}
        {showColorPicker && (
          <div className="bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-3">
            {/* Preset swatches */}
            <div className="flex gap-2">
              {[
                "#00ff00", "#ffb000", "#00ffff", "#ffffff",
                "#ff4444", "#bf5af2", "#4488ff",
              ].map((color) => (
                <button
                  key={color}
                  onClick={() => updateAppState({ asciiColor: color })}
                  className="w-7 h-7 rounded-full border-2 transition"
                  style={{
                    backgroundColor: color,
                    borderColor: asciiColor === color ? "#ffffff" : "#4b5563",
                    boxShadow: asciiColor === color ? "0 0 0 2px rgba(255,255,255,0.4)" : "none",
                  }}
                />
              ))}
            </div>
            {/* Color wheel */}
            <HexColorPicker
              color={asciiColor}
              onChange={(color) => updateAppState({ asciiColor: color })}
              style={{ width: "180px", height: "130px" }}
            />
          </div>
        )}

        {/* Mode toggle row */}
        <div className="flex items-center gap-2">
          {(["monochrome", "color", "emoji"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { updateAppState({ colorMode: mode }); setShowColorPicker(false); }}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition"
              style={{
                backgroundColor: colorMode === mode ? "#ffffff" : "rgba(31,41,55,0.8)",
                color: colorMode === mode ? "#000" : "#9ca3af",
                border: `1px solid ${colorMode === mode ? "#ffffff" : "#374151"}`,
              }}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Charset picker row — hidden in emoji mode */}
        {colorMode !== 'emoji' && (<div className="flex items-center gap-2">
          {(["STANDARD", "MINIMAL", "BLOCKS"] as const).map((key) => (
            <button
              key={key}
              onClick={() => updateAppState({ selectedCharset: key })}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition"
              style={{
                backgroundColor: selectedCharset === key ? asciiColor : "rgba(31,41,55,0.8)",
                color: selectedCharset === key ? "#000" : "#9ca3af",
                border: `1px solid ${selectedCharset === key ? asciiColor : "#374151"}`,
              }}
            >
              {CHARACTER_SETS[key].name.toUpperCase()}
            </button>
          ))}
        </div>)}

        {/* Button row */}
        <div className="flex items-center gap-3">
          {/* Palette toggle — only in monochrome mode */}
          {colorMode === 'monochrome' && (
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-10 h-10 rounded-full border-2 transition hover:scale-110"
              style={{
                backgroundColor: asciiColor,
                borderColor: showColorPicker ? "#ffffff" : "#4b5563",
              }}
              title="Color"
            />
          )}

          {webcamError && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded">
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
