import React from "react";
import EmojiGrid from "../EmojiGrid";
import { useStore } from "../store";

const AsciiDisplay = () => {
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
};

export default AsciiDisplay;
