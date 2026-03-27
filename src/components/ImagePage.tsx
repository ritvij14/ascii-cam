import { useState } from "react";
import { useStore } from "../store";
import AsciiDisplay from "./AsciiDisplay";
import ModeControls from "./ModeControls";

const ImagePage = () => {
  const updateAppState = useStore((state) => state.updateAppState);
  const processImage = useStore((state) => state.processImage);
  const takeScreenshot = useStore((state) => state.takeScreenshot);
  const screenshotLoading = useStore((state) => state.screenshotLoading);
  const uploadedImage = useStore((state) => state.uploadedImage);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);
  const hasOutput = useStore(
    (state) =>
      state.asciiOutput.length > 0 ||
      state.coloredAsciiOutput.length > 0 ||
      state.emojiOutput.rows.length > 0
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.match(/^image\//)) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      updateAppState({
        uploadedImage: dataUrl,
        asciiOutput: "",
        coloredAsciiOutput: "",
        emojiOutput: { cols: 0, rows: [] },
      });
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

  const handleReprocess = async () => {
    if (!uploadedImage) return;
    setIsProcessing(true);
    await processImage();
    setIsProcessing(false);
  };

  return (
    <div
      className="flex flex-col bg-black overflow-hidden"
      style={{ height: "calc(100dvh - 44px)" }}
    >
      {/* Hidden canvases */}
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
      <input
        id="file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {!uploadedImage ? (
        /* ── Upload drop-zone ── */
        <div className="flex-1 flex items-center justify-center p-8">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-input")?.click()}
            className="flex flex-col items-center justify-center gap-5 w-full max-w-md border-2 border-dashed rounded-2xl px-12 py-20 cursor-pointer transition-colors"
            style={{
              borderColor: isDragging ? "#3b82f6" : "#374151",
              backgroundColor: isDragging
                ? "rgba(59,130,246,0.06)"
                : "rgba(255,255,255,0.02)",
            }}
          >
            <div className="text-6xl select-none">🖼️</div>
            <div className="text-center">
              <div className="text-white font-mono text-sm font-semibold mb-1">
                Drop an image here
              </div>
              <div className="text-gray-500 font-mono text-xs">
                or click to browse
              </div>
            </div>
            <div className="text-gray-600 font-mono text-xs tracking-widest uppercase">
              JPG · PNG · GIF · WEBP
            </div>
          </div>
        </div>
      ) : (
        /* ── Split pane: original | ascii ── */
        <div
          className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden"
          style={{ paddingBottom: "96px" }}
        >
          {/* Bottom (mobile) / Left (desktop) — original image */}
          <div className="flex-1 flex flex-col items-center justify-center order-last sm:order-first border-t sm:border-t-0 sm:border-r border-gray-800 p-4 gap-2 min-w-0 min-h-0 overflow-hidden">
            <div className="text-gray-600 font-mono text-xs uppercase tracking-widest">
              Original
            </div>
            <img
              src={uploadedImage}
              alt="Uploaded"
              className="object-contain rounded-lg"
              style={{ maxWidth: "100%", maxHeight: "100%", minHeight: 0 }}
            />
          </div>

          {/* Top (mobile) / Right (desktop) — ascii output */}
          <div className="flex-1 flex flex-col items-center justify-center order-first sm:order-last p-4 gap-2 min-w-0 min-h-0 overflow-hidden">
            <div className="text-gray-600 font-mono text-xs uppercase tracking-widest">
              ASCII
            </div>
            {isProcessing ? (
              <div className="text-green-400 font-mono text-sm">
                Processing...
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-full min-h-0 overflow-hidden">
                <AsciiDisplay />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls — always visible */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3">
        {uploadedImage && (
          <ModeControls
            showColorPicker={showColorPicker}
            setShowColorPicker={setShowColorPicker}
            onModeChange={handleReprocess}
            onCharsetChange={handleReprocess}
          />
        )}

        <div className="flex items-center gap-3">
          {uploadedImage && colorMode === "monochrome" && (
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
          <button
            onClick={() => document.getElementById("file-input")?.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition"
          >
            {uploadedImage ? "Change Image" : "Upload Image"}
          </button>
          {hasOutput && (
            <button
              onClick={takeScreenshot}
              disabled={screenshotLoading}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                "⬇️"
              )}
              <span>Download Image</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImagePage;
