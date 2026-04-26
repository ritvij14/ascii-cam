import type { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { create } from 'zustand';
import { DEFAULT_CHARSET } from '../constants/character-sets';
import type { WorkerOutput } from '../worker/ascii-worker';

interface AppState {
  // Webcam State
  isWebcamActive: boolean;
  webcamError: string | null;
  videoRef: HTMLVideoElement | null;
  streamRef: MediaStream | null;

  // DOM refs for canvas processing
  canvasRef: HTMLCanvasElement | null;
  maskCanvasRef: HTMLCanvasElement | null;

  // Segmentation
  segmenter: SelfieSegmentation | null;
  segmentationLoading: boolean;

  // Render loop
  animationFrameId: number | null;
  segAnimationFrameId: number | null;

  // ASCII State
  asciiOutput: string;
  coloredAsciiOutput: string;
  asciiWidth: number;
  selectedCharset: string;
  asciiColor: string;
  colorMode: 'monochrome' | 'color';

  // Depth control state
  fontSize: number;
  noise: number;
  intensity: number;
  contrast: number;
  histogramEqualization: boolean;

  // Image tab
  uploadedImage: string | null; // base64 data URL

  // Worker
  asciiWorker: Worker | null;
  workerBusy: boolean;

  // Performance metrics
  perfMetrics: {
    fps: number;
    frameTimeMs: number;
    segTimeMs: number;
    asciiTimeMs: number;
    resolution: string;
    gridSize: string;
  } | null;
  showPerfOverlay: boolean;
  screenshotLoading: boolean;
}
interface AppActions {
  // State Update
  updateAppState: (partialState: Partial<AppState>) => void;

  // Business Logic Actions
  processImage: (dataUrl?: string) => Promise<void>;
  initSegmentation: () => Promise<void>;
  startRenderLoop: () => void;
  stopRenderLoop: () => void;
  startSegmentationLoop: () => void;
  stopSegmentationLoop: () => void;
  startWebcam: () => Promise<void>;
  stopWebcam: () => void;
  clearOutput: () => void;
  updateAsciiOutput: (imageData: ImageData) => void;
  updateColorAsciiOutput: (imageData: ImageData) => void;
  takeScreenshot: () => Promise<void>;
}

type AppStore = AppState & AppActions;

const computeAsciiWidth = (sourceWidth: number, fontSize: number): number =>
  Math.max(1, Math.floor(sourceWidth / (fontSize * 0.6)));

export const useStore = create<AppStore>((set, get) => {
  // Single-slot segmentation queue: Stage 1 writes, Stage 2 reads.
  // Not Zustand state — no re-renders on queue changes.
  let segQueueFrame: ImageData | null = null;
  let segBusy = false;
  let workerPostTime = 0;
  let workerInstance: Worker | null = null;

  const getWorker = (): Worker => {
    if (!workerInstance) {
      workerInstance = new Worker(new URL('../worker/ascii-worker.ts', import.meta.url), { type: 'module' });
      workerInstance.onmessage = (e: MessageEvent<WorkerOutput>) => {
        if (e.data.type === 'result') {
          const asciiTimeMs = Math.round((performance.now() - workerPostTime) * 10) / 10;
          if (e.data.asciiOutput !== undefined) {
            set({ asciiOutput: e.data.asciiOutput, workerBusy: false });
          } else if (e.data.coloredAsciiOutput !== undefined) {
            set({ coloredAsciiOutput: e.data.coloredAsciiOutput, workerBusy: false });
          }
          const { perfMetrics } = get();
          if (perfMetrics) set({
            perfMetrics: {
              ...perfMetrics,
              asciiTimeMs,
            }
          });
        }
      };
      set({ asciiWorker: workerInstance });
    }
    return workerInstance;
  };

  return {
  // Initial State
  isWebcamActive: false,
  webcamError: null,
  videoRef: null,
  streamRef: null,
  canvasRef: null,
  maskCanvasRef: null,
  segmenter: null,
  segmentationLoading: true,
  animationFrameId: null,
  segAnimationFrameId: null,
  asciiOutput: '',
  coloredAsciiOutput: '',
  asciiWidth: 120,
  selectedCharset: DEFAULT_CHARSET,
  asciiColor: '#00ff00',
  colorMode: 'monochrome',

  // Depth control defaults
  fontSize: 12,
  noise: 0,
  intensity: 1.0,
  contrast: 1.0,
  histogramEqualization: true,

  uploadedImage: null,
  asciiWorker: null,
  workerBusy: false,
  perfMetrics: null,
  showPerfOverlay: false,
  screenshotLoading: false,

  // Actions
  updateAppState: (partialState) => {
    if ('fontSize' in partialState) {
      set({ ...partialState, asciiOutput: '', coloredAsciiOutput: '' });
    } else {
      set(partialState);
    }
  },

  processImage: async (dataUrl?: string) => {
    const { canvasRef, maskCanvasRef, colorMode } = get();
    const src = dataUrl ?? get().uploadedImage;
    if (!src || !canvasRef || !maskCanvasRef) return;

    const img = new Image();
    img.src = src;
    await new Promise((resolve) => { img.onload = resolve; });

    canvasRef.width = img.width;
    canvasRef.height = img.height;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);

    if (colorMode === 'color') {
      get().updateColorAsciiOutput(imageData);
    } else {
      // monochrome: lazy-init segmenter then run segmentation
      if (!get().segmenter) {
        await get().initSegmentation();
      }
      let processedImageData = imageData;
      const { segmenter, segmentationLoading } = get();
      if (segmenter && !segmentationLoading) {
        try {
          maskCanvasRef.width = img.width;
          maskCanvasRef.height = img.height;
          await segmenter.send({ image: img });
          const maskCtx = maskCanvasRef.getContext('2d');
          if (maskCtx) {
            const maskData = maskCtx.getImageData(0, 0, maskCanvasRef.width, maskCanvasRef.height);
            const masked = new ImageData(
              new Uint8ClampedArray(imageData.data),
              imageData.width,
              imageData.height
            );
            for (let i = 0; i < maskData.data.length; i += 4) {
              const alpha = maskData.data[i] / 255;
              const gammaCorrectedAlpha = Math.pow(alpha, 0.8);
              masked.data[i]     = masked.data[i]     * gammaCorrectedAlpha;
              masked.data[i + 1] = masked.data[i + 1] * gammaCorrectedAlpha;
              masked.data[i + 2] = masked.data[i + 2] * gammaCorrectedAlpha;
            }
            processedImageData = masked;
          }
        } catch (_) { /* skip mask on error */ }
      }
      get().updateAsciiOutput(processedImageData);
    }
  },

  updateAsciiOutput: (imageData) => {
    const { workerBusy, fontSize, selectedCharset, asciiColor, contrast, intensity, noise, histogramEqualization } = get();
    if (workerBusy) return;
    const asciiWidth = computeAsciiWidth(imageData.width, fontSize);
    set({ asciiWidth, workerBusy: true });
    workerPostTime = performance.now();
    getWorker().postMessage(
      { type: 'process', imageData, config: { asciiWidth, selectedCharset, colorMode: 'monochrome', asciiColor, contrast, intensity, noise, histogramEqualization } },
      [imageData.data.buffer]
    );
  },

  updateColorAsciiOutput: (imageData) => {
    const { workerBusy, fontSize, selectedCharset, asciiColor, contrast, intensity, noise, histogramEqualization } = get();
    if (workerBusy) return;
    const asciiWidth = computeAsciiWidth(imageData.width, fontSize);
    set({ asciiWidth, workerBusy: true });
    workerPostTime = performance.now();
    getWorker().postMessage(
      { type: 'process', imageData, config: { asciiWidth, selectedCharset, colorMode: 'color', asciiColor, contrast, intensity, noise, histogramEqualization } },
      [imageData.data.buffer]
    );
  },

  initSegmentation: async () => {
    try {
      const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      selfieSegmentation.setOptions({
        modelSelection: 1,
        selfieMode: false,
      });

      selfieSegmentation.onResults((results) => {
        const { maskCanvasRef } = get();
        if (maskCanvasRef && results.segmentationMask) {
          const maskCtx = maskCanvasRef.getContext('2d');
          if (maskCtx) {
            maskCanvasRef.width = results.segmentationMask.width;
            maskCanvasRef.height = results.segmentationMask.height;
            maskCtx.drawImage(results.segmentationMask, 0, 0);
          }
        }
      });

      set({ segmenter: selfieSegmentation, segmentationLoading: false });
    } catch (err) {
      console.error('Failed to initialize segmentation:', err);
      set({ segmentationLoading: false });
    }
  },

  startRenderLoop: () => {
    const { videoRef, canvasRef, maskCanvasRef } = get();
    if (!videoRef || !canvasRef || !maskCanvasRef) return;

    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    let lastFrameTime = 0;
    const targetFrameMs = 33;

    // Stage 1: pure video capture. Never blocks on segmentation.
    const captureFrame = (timestamp: number) => {
      if (timestamp - lastFrameTime < targetFrameMs) {
        set({ animationFrameId: requestAnimationFrame(captureFrame) });
        return;
      }

      if (videoRef.readyState === videoRef.HAVE_ENOUGH_DATA) {
        const frameStart = performance.now();

        canvasRef.width = videoRef.videoWidth;
        canvasRef.height = videoRef.videoHeight;
        maskCanvasRef.width = videoRef.videoWidth;
        maskCanvasRef.height = videoRef.videoHeight;

        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef, -canvasRef.width, 0);
        ctx.restore();

        const imageData = ctx.getImageData(0, 0, canvasRef.width, canvasRef.height);

        const { colorMode, fontSize } = get();
        if (colorMode === 'color') {
          get().updateColorAsciiOutput(imageData);
        } else {
          // Monochrome: push frame to seg queue (Stage 2 picks it up).
          // Overwrite any queued frame — Stage 2 always gets the newest.
          segQueueFrame = imageData;
        }

        const frameTime = performance.now() - frameStart;
        const frameInterval = lastFrameTime > 0 ? timestamp - lastFrameTime : frameTime;
        lastFrameTime = timestamp;

        const asciiWidth = computeAsciiWidth(videoRef.videoWidth, fontSize);
        const { perfMetrics } = get();
        set({
          perfMetrics: {
            fps: Math.round(1000 / Math.max(frameInterval, 1)),
            frameTimeMs: Math.round(frameTime * 10) / 10,
            segTimeMs: perfMetrics?.segTimeMs ?? 0,
            asciiTimeMs: perfMetrics?.asciiTimeMs ?? 0,
            resolution: `${videoRef.videoWidth}x${videoRef.videoHeight}`,
            gridSize: `${asciiWidth}x${Math.floor(videoRef.videoHeight / (Math.floor(videoRef.videoWidth / asciiWidth) * 2))}`,
          },
        });
      }

      set({ animationFrameId: requestAnimationFrame(captureFrame) });
    };

    set({ animationFrameId: requestAnimationFrame(captureFrame) });
    get().startSegmentationLoop();
  },

  stopRenderLoop: () => {
    const { animationFrameId } = get();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    set({ animationFrameId: null });
    get().stopSegmentationLoop();
  },

  // Stage 2: segmentation loop — runs independently at MediaPipe throughput.
  startSegmentationLoop: () => {
    const { canvasRef, maskCanvasRef } = get();
    if (!canvasRef || !maskCanvasRef) return;
    const maskCtx = maskCanvasRef.getContext('2d');
    if (!maskCtx) return;

    const segLoop = async (_timestamp: number) => {
      const { segmenter, segmentationLoading, colorMode } = get();

      if (colorMode === 'monochrome' && segmenter && !segmentationLoading && segQueueFrame && !segBusy) {
        const frame = segQueueFrame;
        segQueueFrame = null;
        segBusy = true;

        const segStart = performance.now();
        let processedImageData: ImageData = frame;
        try {
          // Draw the queued frame onto maskCanvas before sending to MediaPipe.
          // This ensures the segmentation mask corresponds to the exact same
          // frame we're applying it to — prevents mask/frame temporal mismatch
          // caused by Stage 1 updating canvasRef between frames.
          maskCanvasRef.width = frame.width;
          maskCanvasRef.height = frame.height;
          maskCtx.putImageData(frame, 0, 0);
          await segmenter.send({ image: maskCanvasRef });
          // onResults callback has now overwritten maskCanvas with the mask.
          const maskData = maskCtx.getImageData(0, 0, maskCanvasRef.width, maskCanvasRef.height);
          const masked = new ImageData(
            new Uint8ClampedArray(frame.data),
            frame.width,
            frame.height
          );
          for (let i = 0; i < maskData.data.length; i += 4) {
            const alpha = maskData.data[i] / 255;
            const gammaCorrectedAlpha = Math.pow(alpha, 0.8);
            masked.data[i]     = masked.data[i]     * gammaCorrectedAlpha;
            masked.data[i + 1] = masked.data[i + 1] * gammaCorrectedAlpha;
            masked.data[i + 2] = masked.data[i + 2] * gammaCorrectedAlpha;
          }
          processedImageData = masked;
        } catch { /* skip mask on error, use unmasked frame */ }

        try {
          get().updateAsciiOutput(processedImageData);
        } finally {
          segBusy = false;
        }

        const segTime = performance.now() - segStart;
        const { perfMetrics } = get();
        if (perfMetrics) set({ perfMetrics: { ...perfMetrics, segTimeMs: Math.round(segTime * 10) / 10 } });
      }

      set({ segAnimationFrameId: requestAnimationFrame(segLoop) });
    };

    set({ segAnimationFrameId: requestAnimationFrame(segLoop) });
  },

  stopSegmentationLoop: () => {
    const { segAnimationFrameId } = get();
    if (segAnimationFrameId) cancelAnimationFrame(segAnimationFrameId);
    set({ segAnimationFrameId: null });
    segQueueFrame = null;
    segBusy = false;
  },

  startWebcam: async () => {
    const { videoRef } = get();

    if (!videoRef) {
      set({ webcamError: 'Video element not initialized' });
      return;
    }

    try {
      set({ webcamError: null });

      // Lazy init segmentation
      if (!get().segmenter) {
        await get().initSegmentation();
      }

      const isMobile = window.innerWidth < 768;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { height: { ideal: isMobile ? 480 : 720 } },
        audio: false,
      });

      videoRef.srcObject = stream;
      set({
        streamRef: stream,
        isWebcamActive: true,
      });

      get().startRenderLoop();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access webcam';
      set({
        webcamError: errorMessage,
        isWebcamActive: false,
      });
    }
  },

  takeScreenshot: async () => {
    const { colorMode, asciiOutput, coloredAsciiOutput, asciiColor, selectedCharset } = get();

    set({ screenshotLoading: true });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { set({ screenshotLoading: false }); return; }

    const SCALE = 3;
    const FONT_SIZE = 14 * SCALE;
    const CHAR_W = FONT_SIZE * 0.6;
    const CHAR_H = FONT_SIZE;
    const PAD = 24 * SCALE;

    if (colorMode === 'color') {
      // Parse colored HTML spans into (char, color) pairs
      const parsed: { char: string; color: string }[][] = [];
      const spanRe = /<span style="color:(#[0-9a-f]{6})">(.)<\/span>/g;
      let maxCols = 0;
      for (const line of coloredAsciiOutput.split('\n')) {
        const row: { char: string; color: string }[] = [];
        let m;
        spanRe.lastIndex = 0;
        while ((m = spanRe.exec(line)) !== null) {
          row.push({ color: m[1], char: m[2] });
        }
        if (row.length > 0) { parsed.push(row); maxCols = Math.max(maxCols, row.length); }
      }
      if (!parsed.length) { set({ screenshotLoading: false }); return; }
      canvas.width = maxCols * CHAR_W + PAD * 2;
      canvas.height = parsed.length * CHAR_H + PAD * 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = 'top';
      for (let y = 0; y < parsed.length; y++) {
        for (let x = 0; x < parsed[y].length; x++) {
          const { char, color } = parsed[y][x];
          ctx.fillStyle = color;
          ctx.fillText(char, PAD + x * CHAR_W, PAD + y * CHAR_H);
        }
      }
    } else {
      // monochrome
      const lines = asciiOutput.split('\n').filter(l => l.length > 0);
      if (!lines.length) return;
      const cols = Math.max(...lines.map(l => l.length));
      canvas.width = cols * CHAR_W + PAD * 2;
      canvas.height = lines.length * CHAR_H + PAD * 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = asciiColor;
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = 'top';
      for (let y = 0; y < lines.length; y++) {
        ctx.fillText(lines[y], PAD, PAD + y * CHAR_H);
      }
    }

    const filename = `ascii-cam-${Date.now()}.png`;
    canvas.toBlob((blob) => {
      set({ screenshotLoading: false });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  },

  clearOutput: () => {
    set({ asciiOutput: '', coloredAsciiOutput: '', uploadedImage: null });
  },

  stopWebcam: () => {
    const { streamRef, videoRef } = get();

    get().stopRenderLoop();

    if (streamRef) {
      streamRef.getTracks().forEach(track => track.stop());
    }

    if (videoRef) {
      videoRef.srcObject = null;
    }

    set({
      streamRef: null,
      isWebcamActive: false,
      segmenter: null,
      segmentationLoading: true,
    });
  },
  }; // end of returned state+actions object
}); // end of create callback
