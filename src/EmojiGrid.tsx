import { useStore } from './store';

export default function EmojiGrid() {
  const emojiOutput = useStore((state) => state.emojiOutput);
  const { cols, rows } = emojiOutput;

  if (!cols || !rows.length) {
    return (
      <div className="text-gray-600 font-mono text-sm">
        ASCII output will appear here...
      </div>
    );
  }

  // Fit cols × rows into viewport, same clamp logic as the <pre>
  const fontSize = `clamp(4px, min(calc((100vw - 32px) / ${cols}), calc((100dvh - 32px) / ${rows.length})), 24px)`;

  return (
    <div style={{ fontSize, lineHeight: 1 }}>
      {rows.map((row, y) => (
        <div key={y} style={{ whiteSpace: 'nowrap', height: '1em' }}>
          {row}
        </div>
      ))}
    </div>
  );
}
