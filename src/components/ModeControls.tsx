import { useState, lazy, Suspense } from "react";
import { CHARACTER_SETS } from "../constants/character-sets";
import { useStore } from "../store";

const HexColorPicker = lazy(() => import("react-colorful").then((m) => ({ default: m.HexColorPicker })));

interface ModeControlsProps {
  onModeChange?: () => void;
  onCharsetChange?: () => void;
  onFontSizeChange?: () => void;
  onIntensityChange?: () => void;
  onContrastChange?: () => void;
}

const ModeControls = ({ onModeChange, onCharsetChange, onFontSizeChange, onIntensityChange, onContrastChange }: ModeControlsProps) => {
  const updateAppState = useStore((state) => state.updateAppState);
  const asciiColor = useStore((state) => state.asciiColor);
  const selectedCharset = useStore((state) => state.selectedCharset);
  const colorMode = useStore((state) => state.colorMode);
  const fontSize = useStore((state) => state.fontSize);
  const intensity = useStore((state) => state.intensity);
  const contrast = useStore((state) => state.contrast);

  const [showSettings, setShowSettings] = useState(false);

  const buttonBase = "px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition";

  return (
    <div className="relative">
      {/* Upward settings dropdown */}
      {showSettings && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl p-3 flex flex-col items-center gap-3 z-30 min-w-[240px]">
          {colorMode === "monochrome" && (
            <>
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
              <Suspense fallback={null}>
                <HexColorPicker
                  color={asciiColor}
                  onChange={(color) => updateAppState({ asciiColor: color })}
                  style={{ width: "180px", height: "130px" }}
                />
              </Suspense>
            </>
          )}

          <div className="flex items-center gap-2 w-full">
            <label className="text-xs text-gray-400 font-mono w-16">DETAIL</label>
            <input
              type="range"
              min={2}
              max={20}
              value={22 - fontSize}
              onChange={(e) => {
                const detail = Number(e.target.value);
                updateAppState({ fontSize: 22 - detail });
                onFontSizeChange?.();
              }}
              className="flex-1 accent-white"
            />
            <span className="text-xs text-gray-400 font-mono w-8 text-right">{22 - fontSize}</span>
          </div>

          <div className="flex items-center gap-2 w-full">
            <label className="text-xs text-gray-400 font-mono w-16">INTENSITY</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={intensity}
              onChange={(e) => {
                updateAppState({ intensity: Number(e.target.value) });
                onIntensityChange?.();
              }}
              className="flex-1 accent-white"
            />
            <span className="text-xs text-gray-400 font-mono w-8 text-right">{intensity.toFixed(1)}</span>
          </div>

          <div className="flex items-center gap-2 w-full">
            <label className="text-xs text-gray-400 font-mono w-16">CONTRAST</label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={contrast}
              onChange={(e) => {
                updateAppState({ contrast: Number(e.target.value) });
                onContrastChange?.();
              }}
              className="flex-1 accent-white"
            />
            <span className="text-xs text-gray-400 font-mono w-8 text-right">{contrast.toFixed(1)}</span>
          </div>

        </div>
      )}

      {/* Horizontal configuration bar */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {(["monochrome", "color"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { updateAppState({ colorMode: mode }); onModeChange?.(); }}
              className={buttonBase}
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

        <div className="w-px h-6 bg-gray-700 hidden sm:block" />

        <div className="flex items-center gap-1.5 sm:gap-2">
          {(["STANDARD", "MINIMAL", "BLOCKS"] as const).map((key) => (
            <button
              key={key}
              onClick={() => { updateAppState({ selectedCharset: key }); onCharsetChange?.(); }}
              className={buttonBase}
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

        <div className="w-px h-6 bg-gray-700 hidden sm:block" />

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={buttonBase}
          style={{
            backgroundColor: showSettings ? "#ffffff" : "rgba(31,41,55,0.8)",
            color: showSettings ? "#000" : "#9ca3af",
            border: `1px solid ${showSettings ? "#ffffff" : "#374151"}`,
          }}
          title="Settings"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};

export default ModeControls;
