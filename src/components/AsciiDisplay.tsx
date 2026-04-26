import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

const AsciiDisplay = () => {
  const asciiOutput = useStore((state) => state.asciiOutput);
  const coloredAsciiOutput = useStore((state) => state.coloredAsciiOutput);
  const asciiColor = useStore((state) => state.asciiColor);
  const colorMode = useStore((state) => state.colorMode);
  const fontSize = useStore((state) => state.fontSize);

  const preRef = useRef<HTMLPreElement>(null);
  const [contentNode, setContentNode] = useState<HTMLSpanElement | null>(null);
  const [scale, setScale] = useState(1);
  const lastLoggedFontSize = useRef<number | null>(null);
  const lastLoggedContentH = useRef<number>(0);
  const logSeq = useRef(0);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre || !contentNode) return;

    let rafId = 0;
    const computeScale = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const cw = pre.clientWidth;
        const ch = pre.clientHeight;
        const contentW = contentNode.scrollWidth;
        const contentH = contentNode.scrollHeight;
        if (contentW === 0 || contentH === 0) return;
        const newScale = Math.min(cw / contentW, ch / contentH);
        setScale(newScale);

        const isFontSizeChange = lastLoggedFontSize.current !== fontSize;
        const isRealContent = contentH > 50;
        const isContentGrowth =
          Math.abs(contentH - lastLoggedContentH.current) > 50;

        if (isFontSizeChange || (isRealContent && isContentGrowth)) {
          lastLoggedFontSize.current = fontSize;
          if (isRealContent) lastLoggedContentH.current = contentH;
          logSeq.current += 1;

          const preRect = pre.getBoundingClientRect();
          const spanRect = contentNode.getBoundingClientRect();
          const computedTransform =
            window.getComputedStyle(contentNode).transform;

          const driftX =
            spanRect.left -
            preRect.left +
            spanRect.width / 2 -
            preRect.width / 2;
          const driftY =
            spanRect.top -
            preRect.top +
            spanRect.height / 2 -
            preRect.height / 2;

          const text = colorMode === "color" ? coloredAsciiOutput : asciiOutput;
          const lines = text.split("\n").length;

          console.log(
            "ASCII_CENTER_DEBUG",
            JSON.stringify({
              seq: logSeq.current,
              reason: isFontSizeChange ? "fontSize_change" : "content_growth",
              fontSize,
              scale: newScale,
              pre: {
                clientW: cw,
                clientH: ch,
                rectW: preRect.width,
                rectH: preRect.height,
              },
              content: {
                scrollW: contentW,
                scrollH: contentH,
                offsetW: contentNode.offsetWidth,
                offsetH: contentNode.offsetHeight,
              },
              span: { rectW: spanRect.width, rectH: spanRect.height },
              drift: {
                x: Math.round(driftX * 100) / 100,
                y: Math.round(driftY * 100) / 100,
              },
              transform: computedTransform,
              outputLines: lines,
              outputLen: text.length,
              mode: colorMode,
            })
          );
        }
      });
    };

    const ro = new ResizeObserver(computeScale);
    ro.observe(pre);
    ro.observe(contentNode);
    computeScale();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [contentNode, fontSize]);

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
            fontSize: coloredAsciiOutput ? `${fontSize}px` : "24px",
            transform: coloredAsciiOutput
              ? `translate(-50%, -50%) scale(${scale})`
              : "translate(-50%, -50%)",
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
            fontSize: asciiOutput ? `${fontSize}px` : "24px",
            transform: asciiOutput
              ? `translate(-50%, -50%) scale(${scale})`
              : "translate(-50%, -50%)",
          }}
        >
          {asciiOutput || "ASCII output will appear here..."}
        </span>
      )}
    </pre>
  );
};

export default AsciiDisplay;
