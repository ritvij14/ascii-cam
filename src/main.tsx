import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";
import ReactDOM from "react-dom/client";
import "./index.css";
import { CHARACTER_SETS } from "./constants/character-sets";
import EmojiGrid from "./EmojiGrid";
import { useStore } from "./store";

// Root layout with tab nav
const rootRoute = createRootRoute({
  component: () => (
    <div className="bg-gray-950 text-white min-h-dvh flex flex-col">
      {/* Top tab navigation */}
      <nav className="flex gap-1 px-4 pt-3 pb-0 z-30 relative">
        <Link
          to="/"
          className="px-4 py-1.5 rounded-t-lg text-xs font-mono font-semibold transition"
          activeProps={{ style: { backgroundColor: "#ffffff", color: "#000" } }}
          inactiveProps={{ style: { backgroundColor: "rgba(31,41,55,0.8)", color: "#9ca3af", border: "1px solid #374151" } }}
        >
          WEBCAM
        </Link>
        <Link
          to="/image"
          className="px-4 py-1.5 rounded-t-lg text-xs font-mono font-semibold transition"
          activeProps={{ style: { backgroundColor: "#ffffff", color: "#000" } }}
          inactiveProps={{ style: { backgroundColor: "rgba(31,41,55,0.8)", color: "#9ca3af", border: "1px solid #374151" } }}
        >
          IMAGE
        </Link>
      </nav>
      <div className="flex-1 relative">
        <Outlet />
      </div>
    </div>
  ),
});

// Shared mode/charset/color controls used by both pages
function ModeControls({ showColorPicker, setShowColorPicker }: { showColorPicker: boolean; setShowColorPicker: (v: boolean) => void }) {
  const updateAppState = useStore((state) => state.updateAppState);
  const asciiColor = useStore((state) => state.asciiColor);
  const selectedCharset = useStore((state) => state.selectedCharset);
  const colorMode = useStore((state) => state.colorMode);

  return (
    <>
      {showColorPicker && (
        <div className="bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {["#00ff00", "#ffb000", "#00ffff", "#ffffff", "#ff4444", "#bf5af2", "#4488ff"].map((color) => (
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
          <HexColorPicker
            color={asciiColor}
            onChange={(color) => updateAppState({ asciiColor: color })}
            style={{ width: "180px", height: "130px" }}
          />
        </div>
      )}

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

      {colorMode !== "emoji" && (
        <div className="flex items-center gap-2">
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
        </div>
      )}
    </>
  );
}

// Shared ASCII output display
function AsciiDisplay() {
  const asciiOutput = useStore((state) => state.asciiOutput);
  const coloredAsciiOutput = useStore((state) => state.coloredAsciiOutput);
  const asciiColor = useStore((state) => state.asciiColor);
  const asciiWidth = useStore((state) => state.asciiWidth);
  const colorMode = useStore((state) => state.colorMode);

  const cols = asciiOutput ? asciiOutput.indexOf("\n") || asciiOutput.length : asciiWidth;
  const rows = asciiOutput ? asciiOutput.split("\n").length : 1;

  if (colorMode === "emoji") return <EmojiGrid />;

  return (
    <pre
      className="font-mono whitespace-pre leading-none"
      style={{
        "--cols": cols,
        "--rows": rows,
        fontSize: "clamp(4px, min(calc((100vw - 32px) / var(--cols) / 0.6), calc((100dvh - 32px) / var(--rows))), 16px)",
        color: colorMode === "monochrome" ? asciiColor : undefined,
      } as React.CSSProperties}
      dangerouslySetInnerHTML={
        colorMode === "color"
          ? { __html: coloredAsciiOutput || "ASCII output will appear here..." }
          : undefined
      }
    >
      {colorMode === "monochrome" ? (asciiOutput || "ASCII output will appear here...") : undefined}
    </pre>
  );
}

// Webcam Page
function WebcamPage() {
  const isWebcamActive = useStore((state) => state.isWebcamActive);
  const webcamError = useStore((state) => state.webcamError);
  const updateAppState = useStore((state) => state.updateAppState);
  const startWebcam = useStore((state) => state.startWebcam);
  const stopWebcam = useStore((state) => state.stopWebcam);
  const takeScreenshot = useStore((state) => state.takeScreenshot);
  const perfMetrics = useStore((state) => state.perfMetrics);
  const showPerfOverlay = useStore((state) => state.showPerfOverlay);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);
  const hasOutput = useStore((state) =>
    state.asciiOutput.length > 0 || state.coloredAsciiOutput.length > 0 || state.emojiOutput.rows.length > 0
  );
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div className="relative flex flex-col bg-black overflow-hidden h-full" style={{ minHeight: "calc(100dvh - 44px)" }}>
      <canvas ref={(el) => { if (el) updateAppState({ canvasRef: el }); }} className="hidden" />
      <canvas ref={(el) => { if (el) updateAppState({ maskCanvasRef: el }); }} className="hidden" />

      <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
        <AsciiDisplay />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        <ModeControls showColorPicker={showColorPicker} setShowColorPicker={setShowColorPicker} />

        <div className="flex items-center gap-3">
          {colorMode === "monochrome" && (
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-10 h-10 rounded-full border-2 transition hover:scale-110"
              style={{ backgroundColor: asciiColor, borderColor: showColorPicker ? "#ffffff" : "#4b5563" }}
              title="Color"
            />
          )}
          {webcamError && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-4 py-3 rounded">
              {webcamError}
            </div>
          )}
          {!isWebcamActive ? (
            <button onClick={startWebcam} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition">
              Start Webcam
            </button>
          ) : (
            <button onClick={stopWebcam} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition">
              Stop Webcam
            </button>
          )}
          {hasOutput && (
            <button
              onClick={takeScreenshot}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-3 rounded-lg transition"
              title="Save screenshot"
            >
              📷
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

      {/* Small Webcam Preview */}
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

// Image Page
function ImagePage() {
  const updateAppState = useStore((state) => state.updateAppState);
  const processImage = useStore((state) => state.processImage);
  const takeScreenshot = useStore((state) => state.takeScreenshot);
  const uploadedImage = useStore((state) => state.uploadedImage);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      updateAppState({ uploadedImage: dataUrl, asciiOutput: '', coloredAsciiOutput: '', emojiOutput: { cols: 0, rows: [] } });
      setIsProcessing(true);
      await processImage(dataUrl);
      setIsProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const hasOutput = useStore((state) =>
    state.asciiOutput.length > 0 || state.coloredAsciiOutput.length > 0 || state.emojiOutput.rows.length > 0
  );

  return (
    <div className="relative flex flex-col bg-black overflow-hidden h-full" style={{ minHeight: "calc(100dvh - 44px)" }}>
      {/* Hidden canvases */}
      <canvas ref={(el) => { if (el) updateAppState({ canvasRef: el }); }} className="hidden" />
      <canvas ref={(el) => { if (el) updateAppState({ maskCanvasRef: el }); }} className="hidden" />

      {/* ASCII Output */}
      <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
        {hasOutput ? (
          <AsciiDisplay />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl px-12 py-16 transition-colors cursor-pointer"
            style={{ borderColor: isDragging ? "#3b82f6" : "#374151", backgroundColor: isDragging ? "rgba(59,130,246,0.05)" : "transparent" }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <div className="text-5xl">🖼</div>
            <div className="text-gray-400 font-mono text-sm text-center">
              Drop an image here<br />or click to upload
            </div>
            <div className="text-gray-600 font-mono text-xs">JPG, PNG, GIF</div>
          </div>
        )}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-green-400 font-mono text-sm">Processing...</div>
          </div>
        )}
      </div>

      <input
        id="file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {/* Bottom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        <ModeControls showColorPicker={showColorPicker} setShowColorPicker={setShowColorPicker} />

        <div className="flex items-center gap-3">
          {colorMode === "monochrome" && (
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-10 h-10 rounded-full border-2 transition hover:scale-110"
              style={{ backgroundColor: asciiColor, borderColor: showColorPicker ? "#ffffff" : "#4b5563" }}
              title="Color"
            />
          )}
          <button
            onClick={() => document.getElementById('file-input')?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            {uploadedImage ? "Change Image" : "Upload Image"}
          </button>
          {uploadedImage && (
            <button
              onClick={async () => { setIsProcessing(true); await processImage(); setIsProcessing(false); }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-3 rounded-lg transition"
            >
              Re-render
            </button>
          )}
          {hasOutput && (
            <button
              onClick={takeScreenshot}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-3 rounded-lg transition"
              title="Save screenshot"
            >
              📷
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Routes
const webcamRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: WebcamPage });
const imageRoute = createRoute({ getParentRoute: () => rootRoute, path: "/image", component: ImagePage });
const routeTree = rootRoute.addChildren([webcamRoute, imageRoute]);
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
