import { lazy, Suspense } from "react";
import { CHARACTER_SETS } from "../constants/character-sets";
import { useStore } from "../store";

const HexColorPicker = lazy(() => import("react-colorful").then((m) => ({ default: m.HexColorPicker })));

interface ModeControlsProps {
  showColorPicker: boolean;
  setShowColorPicker: (v: boolean) => void;
  onModeChange?: () => void;
  onCharsetChange?: () => void;
}

const ModeControls = ({ showColorPicker, setShowColorPicker, onModeChange, onCharsetChange }: ModeControlsProps) => {
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
          <Suspense fallback={null}>
            <HexColorPicker
              color={asciiColor}
              onChange={(color) => updateAppState({ asciiColor: color })}
              style={{ width: "180px", height: "130px" }}
            />
          </Suspense>
        </div>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2">
        {(["monochrome", "color", "emoji"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => { updateAppState({ colorMode: mode }); setShowColorPicker(false); onModeChange?.(); }}
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
        <div className="flex items-center gap-1.5 sm:gap-2">
          {(["STANDARD", "MINIMAL", "BLOCKS"] as const).map((key) => (
            <button
              key={key}
              onClick={() => { updateAppState({ selectedCharset: key }); onCharsetChange?.(); }}
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
};

export default ModeControls;
