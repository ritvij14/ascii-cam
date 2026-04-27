/// <reference lib="webworker" />

import { BAYER_MATRIX_4X4, CHARACTER_SETS } from '../constants/character-sets';

export interface WorkerConfig {
  asciiWidth: number;
  selectedCharset: string;
  colorMode: 'monochrome' | 'color';
  asciiColor: string;
  contrast: number;
  intensity: number;
}

export interface WorkerInput {
  type: 'process';
  imageData: ImageData;
  config: WorkerConfig;
}

export interface WorkerOutput {
  type: 'result';
  asciiOutput?: string;
  coloredAsciiOutput?: string;
}

// ============================================================================
// WebGL2 Brightness Shader Setup
// ============================================================================

interface WebGLResources {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  texCoordBuffer: WebGLBuffer;
  vao: WebGLVertexArrayObject;
}

let glResources: WebGLResources | null = null;

const useWebGL = (): boolean => glResources !== null;

interface WhiteBalanceParams {
  wbR: number;
  wbG: number;
  wbB: number;
  tempCorrR: number;
  tempCorrG: number;
  tempCorrB: number;
}

/**
 * Use WebGL to compute per-pixel luminosity values.
 * Returns a Float32Array where each element is the luminosity (0-100) for that pixel.
 */
function computeBrightnessWithWebGL(
  imageData: ImageData,
  width: number,
  height: number,
  wb: WhiteBalanceParams
): Float32Array | null {
  if (!glResources) {
    console.log('[WebGL] No GL resources, returning null');
    return null;
  }

  const { gl, canvas, texture, framebuffer, program, vao } = glResources;

  // Resize canvas to match image dimensions
  canvas.width = width;
  canvas.height = height;

  // Upload image data to texture
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,                // level
    gl.RGBA,          // internal format
    width,
    height,
    0,                // border
    gl.RGBA,          // format
    gl.UNSIGNED_BYTE, // type
    imageData.data
  );

  // Set up framebuffer with RGBA8 texture as render target
  const renderTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, renderTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    renderTexture,
    0
  );

  const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (fbStatus !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('[WebGL] Framebuffer incomplete, status:', fbStatus);
    gl.deleteTexture(renderTexture);
    return null;
  }

  // Set viewport and clear
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Use shader program
  gl.useProgram(program);

  // Set white balance uniforms
  const uWhiteBalanceLoc = gl.getUniformLocation(program, 'uWhiteBalance');
  const uColorTempLoc = gl.getUniformLocation(program, 'uColorTemp');
  const uTextureLoc = gl.getUniformLocation(program, 'uTexture');
  gl.uniform3f(uWhiteBalanceLoc, wb.wbR, wb.wbG, wb.wbB);
  gl.uniform3f(uColorTempLoc, wb.tempCorrR, wb.tempCorrG, wb.tempCorrB);
  gl.uniform1i(uTextureLoc, 0);

  // Bind texture to unit 0
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Draw fullscreen quad
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  // Check for draw errors
  const drawError = gl.getError();
  if (drawError !== gl.NO_ERROR) {
    console.warn('[WebGL] Draw error:', drawError);
  }

  // Read pixels back
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Convert to Float32Array of luminosity values (0-100)
  const brightness = new Float32Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    brightness[j] = (pixels[i] / 255) * 100;
  }

  // Log min/max brightness
  let minB = 100, maxB = 0;
  for (let i = 0; i < brightness.length; i++) {
    if (brightness[i] < minB) minB = brightness[i];
    if (brightness[i] > maxB) maxB = brightness[i];
  }

  // Cleanup render texture
  gl.deleteTexture(renderTexture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return brightness;
}

// Vertex shader: fullscreen quad with texture coordinates
const vertexShaderSource = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;

out vec2 vTexCoord;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord = aTexCoord;
}
`;

// Fragment shader: RGB -> luminosity grayscale with white balance
const fragmentShaderSource = `#version 300 es
  precision highp float;

  in vec2 vTexCoord;
  out vec4 fragColor;

  uniform sampler2D uTexture;
  uniform vec3 uWhiteBalance;
  uniform vec3 uColorTemp;

  float rgbToLum(vec3 rgb) {
    vec3 corrected = clamp(rgb * uWhiteBalance * uColorTemp, 0.0, 1.0);
    float lum = 0.299 * corrected.r + 0.587 * corrected.g + 0.114 * corrected.b;
    return lum;
  }

  void main() {
    vec4 color = texture(uTexture, vTexCoord);
    float lum = rgbToLum(color.rgb);
    fragColor = vec4(lum, lum, lum, 1.0);
  }
  `;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function initWebGL(): WebGLResources | null {
  // Feature detect OffscreenCanvas
  if (typeof OffscreenCanvas === 'undefined') {
    return null;
  }

  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', {
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    return null;
  }

  // Compile shaders
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) {
    return null;
  }

  // Link program
  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  // Create vertex buffers (fullscreen quad)
  const positions = new Float32Array([
    -1, -1,  // bottom-left
     1, -1,  // bottom-right
    -1,  1,  // top-left
     1,  1,  // top-right
  ]);

  const texCoords = new Float32Array([
    0, 0,  // bottom-left → texcoord v=0 = top of ImageData (row 0 = top of original image)
    1, 0,  // bottom-right
    0, 1,  // top-left
    1, 1,  // top-right
  ]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

  // Create VAO
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Position attribute (location 0)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // TexCoord attribute (location 1)
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  // Create texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // Create framebuffer
  const framebuffer = gl.createFramebuffer();

  return {
    gl,
    canvas,
    texture,
    framebuffer,
    program,
    positionBuffer,
    texCoordBuffer,
    vao,
  };
}

// Initialize on module load (once)
glResources = initWebGL();



const processMonochrome = (
  imageData: ImageData,
  config: WorkerConfig
): string => {
  const charset = (CHARACTER_SETS[config.selectedCharset] ?? CHARACTER_SETS['STANDARD']).characters;
  const { asciiWidth, contrast, intensity } = config;
  const { data, width: imgWidth, height: imgHeight } = imageData;

  const cellWidth = Math.floor(imgWidth / asciiWidth);
  const cellHeight = Math.floor(cellWidth * 2);
  const height = Math.floor(imgHeight / cellHeight);

  // White balance: Gray World algorithm, sample every 4th pixel
  const totalPixels = imgWidth * imgHeight;
  let sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < data.length; i += 16) {
    sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
  }
  const sampleCount = Math.ceil(totalPixels / 4);
  const meanR = sumR / sampleCount;
  const meanG = sumG / sampleCount;
  const meanB = sumB / sampleCount;
  const grayMean = (meanR + meanG + meanB) / 3;

  const wbR = meanR > 0 ? grayMean / meanR : 1;
  const wbG = meanG > 0 ? grayMean / meanG : 1;
  const wbB = meanB > 0 ? grayMean / meanB : 1;

  // Color temperature detection & compensation
  const colorTempRatio = (meanR + meanG) / (meanB + 1);
  let tempCorrR = 1, tempCorrG = 1, tempCorrB = 1;
  if (colorTempRatio > 2.5) {
    tempCorrR = 0.92; tempCorrB = 1.08;
  } else if (colorTempRatio < 1.5) {
    tempCorrR = 1.08; tempCorrB = 0.92;
  }

  const rgbToLuminance = (r: number, g: number, b: number): number => {
    r = Math.min(255, r * wbR * tempCorrR);
    g = Math.min(255, g * wbG * tempCorrG);
    b = Math.min(255, b * wbB * tempCorrB);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum * 100 / 255;
  };

  // First pass: per-cell average luminosity
  const cellBrightness = new Float32Array(asciiWidth * height);

  const webglAvailable = useWebGL();

  if (webglAvailable) {
    // WebGL path: compute per-pixel brightness on GPU (with white balance), then average cells on CPU
    const pixelBrightness = computeBrightnessWithWebGL(imageData, imgWidth, imgHeight, {
      wbR, wbG, wbB, tempCorrR, tempCorrG, tempCorrB
    });

    if (pixelBrightness) {
      // WebGL already applied white balance and color temp correction
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < asciiWidth; x++) {
          const idx = y * asciiWidth + x;
          let totalL = 0, pixelCount = 0;
          for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight && cy < imgHeight; cy++) {
            for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth && cx < imgWidth; cx++) {
              totalL += pixelBrightness[cy * imgWidth + cx];
              pixelCount++;
            }
          }
          cellBrightness[idx] = totalL / pixelCount;
        }
      }
    } else {
      // WebGL failed - fall back to CPU
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < asciiWidth; x++) {
          const idx = y * asciiWidth + x;
          let totalL = 0, pixelCount = 0;
          for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight; cy++) {
            for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth; cx++) {
              const index = (cy * imgWidth + cx) * 4;
              totalL += rgbToLuminance(data[index], data[index + 1], data[index + 2]);
              pixelCount++;
            }
          }
          cellBrightness[idx] = totalL / pixelCount;
        }
      }
    }
  } else {
    // CPU path (fallback for Safari < 16.4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < asciiWidth; x++) {
        const idx = y * asciiWidth + x;
        let totalL = 0, pixelCount = 0;
        for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight; cy++) {
          for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth; cx++) {
            const index = (cy * imgWidth + cx) * 4;
            totalL += rgbToLuminance(data[index], data[index + 1], data[index + 2]);
            pixelCount++;
          }
        }
        cellBrightness[idx] = totalL / pixelCount;
      }
    }
  }

  // Apply contrast and intensity multiplier
  for (let i = 0; i < cellBrightness.length; i++) {
    const normalized = cellBrightness[i] / 100;
    const adjusted = (normalized - 0.5) * contrast + 0.5;
    const clamped = Math.max(0, Math.min(1, adjusted));
    cellBrightness[i] = clamped * 100 * intensity;
  }

  // Second pass: unsharp masking + character mapping
  const sharpenK = 0.5;
  const step = 100 / (charset.length - 1);

  const parts: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < asciiWidth; x++) {
      const idx = y * asciiWidth + x;
      const original = cellBrightness[idx];

      let blurSum = 0, blurCount = 0;
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
      const sharpened = Math.max(0, Math.min(100, original + sharpenK * (original - blurred)));

      const bayerThreshold = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16 - 0.5);
      const dithered = sharpened + bayerThreshold * step;
      const charIndex = Math.max(0, Math.min(charset.length - 1, Math.floor((dithered / 100) * (charset.length - 1))));
      const char = charset[charIndex];
      parts.push(char);
    }
    parts.push('\n');
  }

  return parts.join('');
};

const processColor = (
  imageData: ImageData,
  config: WorkerConfig
): string => {
  const charset = (CHARACTER_SETS[config.selectedCharset] ?? CHARACTER_SETS['STANDARD']).characters;
  const { asciiWidth, contrast, intensity } = config;
  const { data, width: imgWidth, height: imgHeight } = imageData;

  const cellWidth = Math.floor(imgWidth / asciiWidth);
  const cellHeight = Math.floor(cellWidth * 2);
  const height = Math.floor(imgHeight / cellHeight);

  const srgbToLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const rgbToLabL = (r: number, g: number, b: number): number => {
    const y = 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
    return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
  };

  const cellR = new Float32Array(asciiWidth * height);
  const cellG = new Float32Array(asciiWidth * height);
  const cellB = new Float32Array(asciiWidth * height);
  const cellBrightness = new Float32Array(asciiWidth * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < asciiWidth; x++) {
      const idx = y * asciiWidth + x;
      let totalR = 0, totalG = 0, totalB = 0, totalL = 0, pixelCount = 0;
      for (let cy = y * cellHeight; cy < y * cellHeight + cellHeight; cy++) {
        for (let cx = x * cellWidth; cx < x * cellWidth + cellWidth; cx++) {
          const i = (cy * imgWidth + cx) * 4;
          totalR += data[i];
          totalG += data[i + 1];
          totalB += data[i + 2];
          totalL += rgbToLabL(data[i], data[i + 1], data[i + 2]);
          pixelCount++;
        }
      }
      cellR[idx] = totalR / pixelCount;
      cellG[idx] = totalG / pixelCount;
      cellB[idx] = totalB / pixelCount;
      cellBrightness[idx] = totalL / pixelCount;
    }
  }

  // Apply contrast and intensity multiplier
  for (let i = 0; i < cellBrightness.length; i++) {
    const normalized = cellBrightness[i] / 100;
    const adjusted = (normalized - 0.5) * contrast + 0.5;
    const clamped = Math.max(0, Math.min(1, adjusted));
    cellBrightness[i] = clamped * 100 * intensity;
  }

  const sharpenK = 0.5;
  const step = 100 / (charset.length - 1);
  const parts: string[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < asciiWidth; x++) {
      const idx = y * asciiWidth + x;
      const original = cellBrightness[idx];

      let blurSum = 0, blurRSum = 0, blurGSum = 0, blurBSum = 0, blurCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy, nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < asciiWidth) {
            const nidx = ny * asciiWidth + nx;
            blurSum += cellBrightness[nidx];
            blurRSum += cellR[nidx];
            blurGSum += cellG[nidx];
            blurBSum += cellB[nidx];
            blurCount++;
          }
        }
      }
      const sharpened = Math.max(0, Math.min(100, original + sharpenK * (original - blurSum / blurCount)));
      const bayerThreshold = (BAYER_MATRIX_4X4[y % 4][x % 4] / 16 - 0.5);
      const dithered = sharpened + bayerThreshold * step;
      const charIndex = Math.max(0, Math.min(charset.length - 1, Math.floor((dithered / 100) * (charset.length - 1))));
      const char = charset[charIndex];

      const colorK = 0.8;
      const sR = Math.max(0, Math.min(255, cellR[idx] + colorK * (cellR[idx] - blurRSum / blurCount)));
      const sG = Math.max(0, Math.min(255, cellG[idx] + colorK * (cellG[idx] - blurGSum / blurCount)));
      const sB = Math.max(0, Math.min(255, cellB[idx] + colorK * (cellB[idx] - blurBSum / blurCount)));

      let cr = sR / 255, cg = sG / 255, cb = sB / 255;
      cr = Math.pow(cr, 0.55); cg = Math.pow(cg, 0.55); cb = Math.pow(cb, 0.55);
      const cmax = Math.max(cr, cg, cb), cmin = Math.min(cr, cg, cb);
      const l = (cmax + cmin) / 2;
      const d = cmax - cmin;
      if (d > 0) {
        const s = Math.min(1, (d / (1 - Math.abs(2 * l - 1))) * 1.5);
        const chroma = s * (1 - Math.abs(2 * l - 1));
        let h = 0;
        if (cmax === cr) h = ((cg - cb) / d + 6) % 6;
        else if (cmax === cg) h = (cb - cr) / d + 2;
        else h = (cr - cg) / d + 4;
        const x = chroma * (1 - Math.abs(h % 2 - 1));
        const m = l - chroma / 2;
        const hi = Math.floor(h);
        const [r1, g1, b1] = hi === 0 ? [chroma, x, 0] : hi === 1 ? [x, chroma, 0] :
          hi === 2 ? [0, chroma, x] : hi === 3 ? [0, x, chroma] :
          hi === 4 ? [x, 0, chroma] : [chroma, 0, x];
        cr = Math.min(1, r1 + m); cg = Math.min(1, g1 + m); cb = Math.min(1, b1 + m);
      }
      const r = Math.round(cr * 255).toString(16).padStart(2, '0');
      const g = Math.round(cg * 255).toString(16).padStart(2, '0');
      const b = Math.round(cb * 255).toString(16).padStart(2, '0');
      parts.push(`<span style="color:#${r}${g}${b}">${char}</span>`);
    }
    parts.push('\n');
  }

  return parts.join('');
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { type, imageData, config } = e.data;

  if (type === 'process') {
    const result: WorkerOutput = { type: 'result' };

    if (config.colorMode === 'monochrome') {
      result.asciiOutput = processMonochrome(imageData, config);
    } else if (config.colorMode === 'color') {
      result.coloredAsciiOutput = processColor(imageData, config);
    }

    ctx.postMessage(result);
  }
};
