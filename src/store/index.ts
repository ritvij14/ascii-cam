import { create } from 'zustand';
import { CHARACTER_SETS, DEFAULT_CHARSET } from '../constants/character-sets';

interface AppState {
  // Webcam State
  isWebcamActive: boolean;
  webcamError: string | null;
  videoRef: HTMLVideoElement | null;
  streamRef: MediaStream | null;

  // ASCII State
  asciiOutput: string;
  asciiWidth: number;
  selectedCharset: string;
}
interface AppActions {
  // State Update
  updateAppState: (partialState: Partial<AppState>) => void;

  // Business Logic Actions
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
  asciiOutput: '',
  asciiWidth: 80,
  selectedCharset: DEFAULT_CHARSET,

  // Actions
  updateAppState: (partialState) => set(partialState),

  updateAsciiOutput: (imageData, maskData) => {
    const { asciiWidth, selectedCharset } = get();
    const charset = CHARACTER_SETS[selectedCharset].characters;

    // Apply segmentation mask if provided
    let processedImageData = imageData;
    if (maskData) {
      // Inline segmentation logic
      const masked = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );

      // Debug: Sample some mask values
      let sampleCount = 0;
      let totalMaskValue = 0;

      // Iterate through all pixels
      for (let i = 0; i < maskData.data.length; i += 4) {
        // MediaPipe mask uses the RED channel for segmentation mask values
        const maskValue = maskData.data[i]; // Just use R channel

        // Sample every 10000th pixel for debugging
        if (i % 10000 === 0) {
          sampleCount++;
          totalMaskValue += maskValue;
          // Also log R, G, B, A separately to understand the mask structure
          if (sampleCount === 1) {
            console.log('First pixel RGBA:', maskData.data[i], maskData.data[i+1], maskData.data[i+2], maskData.data[i+3]);
          }
        }

        // Normalize mask value to 0-1
        const alpha = maskValue / 255;

        // Apply gamma correction for smoother edge transitions
        const gammaCorrectedAlpha = Math.pow(alpha, 0.8);

        // Alpha blend with black background (0, 0, 0)
        // This creates smooth anti-aliased edges instead of harsh binary cutoff
        masked.data[i] = masked.data[i] * gammaCorrectedAlpha;     // R
        masked.data[i + 1] = masked.data[i + 1] * gammaCorrectedAlpha; // G
        masked.data[i + 2] = masked.data[i + 2] * gammaCorrectedAlpha; // B
      }

      // Debug output
      const avgMaskValue = totalMaskValue / sampleCount;
      console.log('Mask debug - Avg value:', avgMaskValue, 'Samples:', sampleCount);

      processedImageData = masked;
    }

    // Inline ASCII conversion logic
    const { data, width: imgWidth, height: imgHeight } = processedImageData;

    // Calculate how many pixels each ASCII character represents
    const cellWidth = Math.floor(imgWidth / asciiWidth);
    const cellHeight = Math.floor(cellWidth * 2); // ASCII characters are roughly 2x taller than wide

    const height = Math.floor(imgHeight / cellHeight);

    let ascii = '';

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < asciiWidth; x++) {
        // Calculate the average brightness of this cell
        let totalBrightness = 0;
        let pixelCount = 0;

        for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight; cy++) {
          for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth; cx++) {
            const index = (cy * imgWidth + cx) * 4;

            // Calculate luminance using standard weights
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];

            const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
            totalBrightness += brightness;
            pixelCount++;
          }
        }

        const avgBrightness = totalBrightness / pixelCount;

        // Apply gamma correction for perceptually accurate brightness
        const perceptualBrightness = Math.pow(avgBrightness / 255, 1 / 2.2);

        // Map perceptual brightness to character index
        const charIndex = Math.floor(perceptualBrightness * (charset.length - 1));
        ascii += charset[charIndex];
      }
      ascii += '\n';
    }

    set({ asciiOutput: ascii });
  },

  startWebcam: async () => {
    const { videoRef } = get();

    if (!videoRef) {
      set({ webcamError: 'Video element not initialized' });
      return;
    }

    try {
      set({ webcamError: null });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      videoRef.srcObject = stream;
      set({
        streamRef: stream,
        isWebcamActive: true
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access webcam';
      set({
        webcamError: errorMessage,
        isWebcamActive: false
      });
    }
  },

  stopWebcam: () => {
    const { streamRef, videoRef } = get();

    if (streamRef) {
      streamRef.getTracks().forEach(track => track.stop());
    }

    if (videoRef) {
      videoRef.srcObject = null;
    }

    set({
      streamRef: null,
      isWebcamActive: false
    });
  },
}));
