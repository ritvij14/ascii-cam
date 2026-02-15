import { SelfieSegmentation } from '@mediapipe/selfie_segmentation';
import { create } from 'zustand';
import { CHARACTER_SETS, DEFAULT_CHARSET } from '../constants/character-sets';

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

  // ASCII State
  asciiOutput: string;
  asciiWidth: number;
  selectedCharset: string;

  // Temporal smoothing
  previousMaskData: Uint8ClampedArray | null;

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
}
interface AppActions {
  // State Update
  updateAppState: (partialState: Partial<AppState>) => void;

  // Business Logic Actions
  initSegmentation: () => Promise<void>;
  startRenderLoop: () => void;
  stopRenderLoop: () => void;
  startWebcam: () => Promise<void>;
  stopWebcam: () => void;
  updateAsciiOutput: (imageData: ImageData, maskData?: ImageData) => void;
}

type AppStore = AppState & AppActions;

export const useStore = create<AppStore>((set, get) => ({
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
  asciiOutput: '',
  asciiWidth: 120,
  selectedCharset: DEFAULT_CHARSET,
  previousMaskData: null,
  perfMetrics: null,
  showPerfOverlay: false,

  // Actions
  updateAppState: (partialState) => set(partialState),

  updateAsciiOutput: (imageData, maskData) => {
    const { asciiWidth, selectedCharset, previousMaskData } = get();
    const charset = CHARACTER_SETS[selectedCharset].characters;

    // Apply segmentation mask if provided
    let processedImageData = imageData;
    if (maskData) {
      const masked = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );

      // Temporal smoothing: blend current mask with previous frame's mask
      const smoothedMask = new Uint8ClampedArray(maskData.data);
      if (previousMaskData && previousMaskData.length === maskData.data.length) {
        for (let i = 0; i < maskData.data.length; i += 4) {
          smoothedMask[i] = 0.7 * maskData.data[i] + 0.3 * previousMaskData[i];
        }
      }
      set({ previousMaskData: new Uint8ClampedArray(maskData.data) });

      for (let i = 0; i < smoothedMask.length; i += 4) {
        const alpha = smoothedMask[i] / 255;
        const gammaCorrectedAlpha = Math.pow(alpha, 0.8);
        masked.data[i] = masked.data[i] * gammaCorrectedAlpha;
        masked.data[i + 1] = masked.data[i + 1] * gammaCorrectedAlpha;
        masked.data[i + 2] = masked.data[i + 2] * gammaCorrectedAlpha;
      }

      processedImageData = masked;
    }

    // ASCII conversion with white balance, color temp correction, LAB brightness, and unsharp masking
    const { data, width: imgWidth, height: imgHeight } = processedImageData;

    const cellWidth = Math.floor(imgWidth / asciiWidth);
    const cellHeight = Math.floor(cellWidth * 2);
    const height = Math.floor(imgHeight / cellHeight);

    // White balance: compute mean R, G, B across frame (Gray World algorithm)
    const totalPixels = imgWidth * imgHeight;
    let sumR = 0, sumG = 0, sumB = 0;
    // Sample every 4th pixel for speed
    for (let i = 0; i < data.length; i += 16) {
      sumR += data[i];
      sumG += data[i + 1];
      sumB += data[i + 2];
    }
    const sampleCount = Math.ceil(totalPixels / 4);
    const meanR = sumR / sampleCount;
    const meanG = sumG / sampleCount;
    const meanB = sumB / sampleCount;
    const grayMean = (meanR + meanG + meanB) / 3;

    // White balance correction factors
    const wbR = meanR > 0 ? grayMean / meanR : 1;
    const wbG = meanG > 0 ? grayMean / meanG : 1;
    const wbB = meanB > 0 ? grayMean / meanB : 1;

    // Color temperature detection & compensation
    const colorTempRatio = (meanR + meanG) / (meanB + 1);
    let tempCorrR = 1, tempCorrG = 1, tempCorrB = 1;
    if (colorTempRatio > 2.5) {
      // Warm light (tungsten/sunset): reduce red, boost blue
      tempCorrR = 0.92;
      tempCorrB = 1.08;
    } else if (colorTempRatio < 1.5) {
      // Cool light (fluorescent/overcast): boost red, reduce blue
      tempCorrR = 1.08;
      tempCorrB = 0.92;
    }

    // Helper: linearize sRGB component for LAB conversion
    const srgbToLinear = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };

    // Helper: RGB to LAB L* channel (perceptually uniform lightness)
    const rgbToLabL = (r: number, g: number, b: number): number => {
      // Apply white balance + color temp correction
      r = Math.min(255, r * wbR * tempCorrR);
      g = Math.min(255, g * wbG * tempCorrG);
      b = Math.min(255, b * wbB * tempCorrB);

      // sRGB to linear
      const lr = srgbToLinear(r);
      const lg = srgbToLinear(g);
      const lb = srgbToLinear(b);

      // Linear RGB to CIE XYZ Y component (relative luminance)
      const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;

      // Y to L* (CIE LAB lightness)
      const fy = y > 0.008856 ? Math.cbrt(y) : (903.3 * y + 16) / 116;
      return y > 0.008856 ? 116 * fy - 16 : 903.3 * y;
    };

    // First pass: compute per-cell average LAB lightness
    const cellBrightness = new Float32Array(asciiWidth * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < asciiWidth; x++) {
        let totalL = 0;
        let pixelCount = 0;
        for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight; cy++) {
          for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth; cx++) {
            const index = (cy * imgWidth + cx) * 4;
            totalL += rgbToLabL(data[index], data[index + 1], data[index + 2]);
            pixelCount++;
          }
        }
        cellBrightness[y * asciiWidth + x] = totalL / pixelCount;
      }
    }

    // Second pass: unsharp masking and character mapping
    const sharpenK = 0.5;
    const parts: string[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < asciiWidth; x++) {
        const idx = y * asciiWidth + x;
        const original = cellBrightness[idx];

        // 3x3 neighborhood average as "blur"
        let blurSum = 0;
        let blurCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < asciiWidth) {
              blurSum += cellBrightness[ny * asciiWidth + nx];
              blurCount++;
            }
          }
        }
        const blurred = blurSum / blurCount;

        // Sharpened = original + k * (original - blurred), L* range is 0-100
        const sharpened = Math.max(0, Math.min(100, original + sharpenK * (original - blurred)));

        // L* is already perceptually linear, just normalize to 0-1
        const charIndex = Math.floor((sharpened / 100) * (charset.length - 1));
        parts.push(charset[charIndex]);
      }
      parts.push('\n');
    }

    set({ asciiOutput: parts.join('') });
  },

  initSegmentation: async () => {
    try {
      const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      selfieSegmentation.setOptions({
        modelSelection: 1,
        selfieMode: true,
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
    const maskCtx = maskCanvasRef.getContext('2d');
    if (!ctx || !maskCtx) return;

    let lastFrameTime = 0;
    const targetFrameMs = 33;
    let aspectChecked = false;

    const captureFrame = async (timestamp: number) => {
      if (timestamp - lastFrameTime < targetFrameMs) {
        set({ animationFrameId: requestAnimationFrame(captureFrame) });
        return;
      }

      if (videoRef.readyState === videoRef.HAVE_ENOUGH_DATA) {
        if (!aspectChecked) {
          aspectChecked = true;
          if (videoRef.videoHeight > videoRef.videoWidth) {
            set({ asciiWidth: 80 });
          }
        }

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

        let maskData: ImageData | undefined;
        let segTime = 0;
        const { segmenter, segmentationLoading } = get();
        if (segmenter && !segmentationLoading) {
          try {
            const segStart = performance.now();
            await segmenter.send({ image: videoRef });
            maskData = maskCtx.getImageData(0, 0, maskCanvasRef.width, maskCanvasRef.height);
            segTime = performance.now() - segStart;
          } catch (err) {
            console.error('Segmentation error:', err);
          }
        }

        const asciiStart = performance.now();
        get().updateAsciiOutput(imageData, maskData);
        const asciiTime = performance.now() - asciiStart;

        const frameTime = performance.now() - frameStart;
        lastFrameTime = timestamp;

        const { asciiWidth } = get();
        set({
          perfMetrics: {
            fps: Math.round(1000 / Math.max(frameTime, 1)),
            frameTimeMs: Math.round(frameTime * 10) / 10,
            segTimeMs: Math.round(segTime * 10) / 10,
            asciiTimeMs: Math.round(asciiTime * 10) / 10,
            resolution: `${videoRef.videoWidth}x${videoRef.videoHeight}`,
            gridSize: `${asciiWidth}x${Math.floor(videoRef.videoHeight / (Math.floor(videoRef.videoWidth / asciiWidth) * 2))}`,
          },
        });
      }

      set({ animationFrameId: requestAnimationFrame(captureFrame) });
    };

    set({ animationFrameId: requestAnimationFrame(captureFrame) });
  },

  stopRenderLoop: () => {
    const { animationFrameId } = get();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    set({ animationFrameId: null });
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
}));
