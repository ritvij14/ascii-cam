import { useState } from "react";
import { useStore } from "../store";
import AsciiDisplay from "./AsciiDisplay";
import ModeControls from "./ModeControls";

type PerfMetrics = NonNullable<
  ReturnType<typeof useStore.getState>["perfMetrics"]
>;

// Tightly coupled to WebcamPage, ≤20 LOC
const PerfOverlay = ({ metrics }: { metrics: PerfMetrics }) => (
  <div className="bg-black/70 text-green-300 font-mono text-xs px-3 py-2 rounded space-y-0.5">
    <div>FPS: {metrics.fps}</div>
    <div>Frame: {metrics.frameTimeMs}ms</div>
    <div>Seg: {metrics.segTimeMs}ms</div>
    <div>ASCII: {metrics.asciiTimeMs}ms</div>
    <div>Res: {metrics.resolution}</div>
    <div>Grid: {metrics.gridSize}</div>
  </div>
);

const WebcamPage = () => {
  const isWebcamActive = useStore((state) => state.isWebcamActive);
  const webcamError = useStore((state) => state.webcamError);
  const updateAppState = useStore((state) => state.updateAppState);
  const startWebcam = useStore((state) => state.startWebcam);
  const stopWebcam = useStore((state) => state.stopWebcam);
  const takeScreenshot = useStore((state) => state.takeScreenshot);
  const screenshotLoading = useStore((state) => state.screenshotLoading);
  const perfMetrics = useStore((state) => state.perfMetrics);
  const showPerfOverlay = useStore((state) => state.showPerfOverlay);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);
  const hasOutput = useStore(
    (state) =>
      state.asciiOutput.length > 0 ||
      state.coloredAsciiOutput.length > 0 ||
      state.emojiOutput.rows.length > 0
  );
  const [showColorPicker, setShowColorPicker] = useState(false);

  return (
    <div
      className="relative flex flex-col bg-black overflow-hidden h-full"
      style={{ minHeight: "calc(100dvh - 44px)" }}
    >
      <canvas
        ref={(el) => {
          if (el) updateAppState({ canvasRef: el });
        }}
        className="hidden"
      />
      <canvas
        ref={(el) => {
          if (el) updateAppState({ maskCanvasRef: el });
        }}
        className="hidden"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 overflow-hidden">
        <AsciiDisplay />
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        <ModeControls
          showColorPicker={showColorPicker}
          setShowColorPicker={setShowColorPicker}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          {colorMode === "monochrome" && (
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-9 h-9 rounded-full border-2 transition hover:scale-110"
              style={{
                backgroundColor: asciiColor,
                borderColor: showColorPicker ? "#ffffff" : "#4b5563",
              }}
              title="Color"
            />
          )}
          {webcamError && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-sm">
              {webcamError}
            </div>
          )}
          {!isWebcamActive ? (
            <button
              onClick={startWebcam}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 sm:px-6 sm:py-3 text-sm rounded-lg transition"
            >
              Start Webcam
            </button>
          ) : (
            <button
              onClick={stopWebcam}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 sm:px-6 sm:py-3 text-sm rounded-lg transition"
            >
              Stop Webcam
            </button>
          )}
          {hasOutput && (
            <button
              onClick={takeScreenshot}
              disabled={screenshotLoading}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-2 sm:px-6 sm:py-3 text-sm rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {screenshotLoading ? (
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              ) : (
                "📷"
              )}
              <span>Take Screenshot</span>
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
          <PerfOverlay metrics={perfMetrics} />
        )}
      </div>

      {/* Small Webcam Preview */}
      <div className="absolute top-14 right-4 z-10">
        <video
          ref={(el) => {
            if (el) updateAppState({ videoRef: el });
          }}
          autoPlay
          playsInline
          className="rounded-lg border-2 border-gray-700 max-w-[120px] max-h-[120px] object-contain scale-x-[-1]"
        />
      </div>
    </div>
  );
};

export default WebcamPage;
