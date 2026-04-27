import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

const AsciiDisplay = () => {
  const asciiOutput = useStore((state) => state.asciiOutput);
  const coloredAsciiOutput = useStore((state) => state.coloredAsciiOutput);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);

  const preRef = useRef<HTMLPreElement>(null);
  const [contentNode, setContentNode] = useState<HTMLSpanElement | null>(null);
  const [displayFontSize, setDisplayFontSize] = useState(10);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre || !contentNode) return;

    let rafId = 0;
    const compute = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const cw = pre.clientWidth;
        const ch = pre.clientHeight;
        const contentW = contentNode.scrollWidth;
        const contentH = contentNode.scrollHeight;
        if (contentW === 0 || contentH === 0) return;

        const text = colorMode === "color" ? coloredAsciiOutput : asciiOutput;
        if (!text) return;

        const scale = Math.min(cw / contentW, ch / contentH);
        const nextFontSize = Math.max(2, displayFontSize * scale);

        if (Math.abs(nextFontSize - displayFontSize) > 0.5) {
          setDisplayFontSize(nextFontSize);
        }
      });
    };

    const ro = new ResizeObserver(compute);
    ro.observe(pre);
    ro.observe(contentNode);
    compute();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [contentNode, displayFontSize, asciiOutput, coloredAsciiOutput, colorMode]);

  return (
    <pre
      ref={preRef}
      className="font-mono whitespace-pre leading-none w-full h-full relative overflow-hidden"
      style={{
        color: colorMode === "monochrome" ? asciiColor : undefined,
      }}
    >
      {colorMode === "color" ? (
        <span
          ref={setContentNode}
          className="absolute top-1/2 left-1/2 whitespace-pre leading-none"
          style={{
            fontSize: coloredAsciiOutput ? `${displayFontSize}px` : "24px",
            transform: "translate(-50%, -50%)",
          }}
          dangerouslySetInnerHTML={{
            __html: coloredAsciiOutput || "ASCII output will appear here...",
          }}
        />
      ) : (
        <span
          ref={setContentNode}
          className="absolute top-1/2 left-1/2 whitespace-pre leading-none"
          style={{
            fontSize: asciiOutput ? `${displayFontSize}px` : "24px",
            transform: "translate(-50%, -50%)",
          }}
        >
          {asciiOutput || "ASCII output will appear here..."}
        </span>
      )}
    </pre>
  );
};

export default AsciiDisplay;
