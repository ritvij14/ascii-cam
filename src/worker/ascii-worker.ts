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

interface WebGLResult {
  cellR?: Float32Array;
  cellG?: Float32Array;
  cellB?: Float32Array;
  cellBrightness: Float32Array;
}

/**
 * Use WebGL to compute per-cell averaged values.
 * Mode 0 (monochrome): returns cellBrightness only (red channel = lum/100).
 * Mode 1 (color): returns cellR, cellG, cellB, cellBrightness (alpha = lum/100).
 */
function computeWithWebGL(
  imageData: ImageData,
  imgWidth: number,
  imgHeight: number,
  wb: WhiteBalanceParams,
  mode: 0 | 1,
  asciiWidth: number,
  cellWidth: number,
  cellHeight: number,
  gridHeight: number
): WebGLResult | null {
  if (!glResources) {
    return null;
  }

  if (asciiWidth <= 0 || gridHeight <= 0) {
    return null;
  }

  const { gl, canvas, texture, framebuffer, program, vao } = glResources;

  canvas.width = asciiWidth;
  canvas.height = gridHeight;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    imgWidth,
    imgHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    imageData.data
  );

  const renderTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, renderTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    asciiWidth,
    gridHeight,
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
    gl.deleteTexture(renderTexture);
    return null;
  }

  gl.viewport(0, 0, asciiWidth, gridHeight);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  const uWhiteBalanceLoc = gl.getUniformLocation(program, 'uWhiteBalance');
  const uColorTempLoc = gl.getUniformLocation(program, 'uColorTemp');
  const uTextureLoc = gl.getUniformLocation(program, 'uTexture');
  const uModeLoc = gl.getUniformLocation(program, 'uMode');
  const uSourceWidthLoc = gl.getUniformLocation(program, 'uSourceWidth');
  const uSourceHeightLoc = gl.getUniformLocation(program, 'uSourceHeight');
  const uCellWidthLoc = gl.getUniformLocation(program, 'uCellWidth');
  const uCellHeightLoc = gl.getUniformLocation(program, 'uCellHeight');
  const uAsciiWidthLoc = gl.getUniformLocation(program, 'uAsciiWidth');
  const uGridHeightLoc = gl.getUniformLocation(program, 'uGridHeight');

  gl.uniform3f(uWhiteBalanceLoc, wb.wbR, wb.wbG, wb.wbB);
  gl.uniform3f(uColorTempLoc, wb.tempCorrR, wb.tempCorrG, wb.tempCorrB);
  gl.uniform1i(uTextureLoc, 0);
  gl.uniform1i(uModeLoc, mode);
  gl.uniform1i(uSourceWidthLoc, imgWidth);
  gl.uniform1i(uSourceHeightLoc, imgHeight);
  gl.uniform1i(uCellWidthLoc, cellWidth);
  gl.uniform1i(uCellHeightLoc, cellHeight);
  gl.uniform1i(uAsciiWidthLoc, asciiWidth);
  gl.uniform1i(uGridHeightLoc, gridHeight);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);

  const cellCount = asciiWidth * gridHeight;
  const pixels = new Uint8Array(cellCount * 4);
  gl.readPixels(0, 0, asciiWidth, gridHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  const cellBrightness = new Float32Array(cellCount);

  if (mode === 0) {
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      cellBrightness[j] = (pixels[i] / 255) * 100;
    }
  } else {
    const cellR = new Float32Array(cellCount);
    const cellG = new Float32Array(cellCount);
    const cellB = new Float32Array(cellCount);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
      cellR[j] = pixels[i];
      cellG[j] = pixels[i + 1];
      cellB[j] = pixels[i + 2];
      cellBrightness[j] = (pixels[i + 3] / 255) * 100;
    }
    gl.deleteTexture(renderTexture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { cellR, cellG, cellB, cellBrightness };
  }

  gl.deleteTexture(renderTexture);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { cellBrightness };
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

// Fragment shader: per-cell average of source pixels
// Mode 0 (monochrome): outputs vec4(lum/100, lum/100, lum/100, 1.0)
// Mode 1 (color): outputs vec4(avgR, avgG, avgB, lum/100)
const fragmentShaderSource = `#version 300 es
  precision highp float;

  in vec2 vTexCoord;
  out vec4 fragColor;

  uniform sampler2D uTexture;
  uniform vec3 uWhiteBalance;
  uniform vec3 uColorTemp;
  uniform int uMode;
  uniform int uSourceWidth;
  uniform int uSourceHeight;
  uniform int uCellWidth;
  uniform int uCellHeight;
  uniform int uAsciiWidth;
  uniform int uGridHeight;

  float rgbToLum(vec3 rgb) {
    vec3 corrected = clamp(rgb * uWhiteBalance * uColorTemp, 0.0, 1.0);
    float lum = 0.299 * corrected.r + 0.587 * corrected.g + 0.114 * corrected.b;
    return lum;
  }

  float srgbToLinear(float c) {
    return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
  }

  float rgbToLabL(vec3 rgb) {
    float y = 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
    return y > 0.008856 ? 116.0 * pow(y, 1.0 / 3.0) - 16.0 : 903.3 * y;
  }

  void main() {
    int cellX = int(gl_FragCoord.x);
    int cellY = int(gl_FragCoord.y);

    int sx_start = cellX * uCellWidth;
    int sy_start = cellY * uCellHeight;

    int maxDx = uCellWidth;
    int maxDy = uCellHeight;
    if (sx_start + maxDx > uSourceWidth) maxDx = uSourceWidth - sx_start;
    if (sy_start + maxDy > uSourceHeight) maxDy = uSourceHeight - sy_start;
    if (maxDx < 0) maxDx = 0;
    if (maxDy < 0) maxDy = 0;

    float sumR = 0.0;
    float sumG = 0.0;
    float sumB = 0.0;
    float sumL = 0.0;
    int count = 0;

    for (int dy = 0; dy < 128; dy++) {
      if (dy >= maxDy) break;
      for (int dx = 0; dx < 128; dx++) {
        if (dx >= maxDx) break;
        vec2 sampleCoord = vec2(
          float(sx_start + dx) + 0.5,
          float(sy_start + dy) + 0.5
        ) / vec2(float(uSourceWidth), float(uSourceHeight));
        vec4 color = texture(uTexture, sampleCoord);
        sumR += color.r;
        sumG += color.g;
        sumB += color.b;
        if (uMode == 0) {
          sumL += rgbToLum(color.rgb);
        } else {
          sumL += rgbToLabL(color.rgb);
        }
        count++;
      }
    }

    if (count == 0) {
      fragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    float avgR = sumR / float(count);
    float avgG = sumG / float(count);
    float avgB = sumB / float(count);
    float avgL = sumL / float(count);

    if (uMode == 0) {
      fragColor = vec4(avgL, avgL, avgL, 1.0);
    } else {
      fragColor = vec4(avgR, avgG, avgB, avgL / 100.0);
    }
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
    const result = computeWithWebGL(imageData, imgWidth, imgHeight, {
      wbR, wbG, wbB, tempCorrR, tempCorrG, tempCorrB
    }, 0, asciiWidth, cellWidth, cellHeight, height);

    if (result) {
      cellBrightness.set(result.cellBrightness);
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

  const webglAvailable = useWebGL();

  if (webglAvailable) {
    const result = computeWithWebGL(imageData, imgWidth, imgHeight, {
      wbR: 1, wbG: 1, wbB: 1, tempCorrR: 1, tempCorrG: 1, tempCorrB: 1
    }, 1, asciiWidth, cellWidth, cellHeight, height);

    if (result) {
      cellR.set(result.cellR!);
      cellG.set(result.cellG!);
      cellB.set(result.cellB!);
      cellBrightness.set(result.cellBrightness);
    } else {
      // WebGL failed - fall back to CPU
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
    }
  } else {
    // CPU path (fallback for Safari < 16.4)
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

      let cr = GAMMA_TABLE[Math.round(sR)];
      let cg = GAMMA_TABLE[Math.round(sG)];
      let cb = GAMMA_TABLE[Math.round(sB)];

      // Simple luminance-preserving chroma boost (replaces expensive HSL round-trip)
      const mid = (cr + cg + cb) / 3;
      const boost = 1.5;
      cr = Math.min(1, Math.max(0, mid + (cr - mid) * boost));
      cg = Math.min(1, Math.max(0, mid + (cg - mid) * boost));
      cb = Math.min(1, Math.max(0, mid + (cb - mid) * boost));

      const r = HEX_TABLE[Math.round(cr * 255)];
      const g = HEX_TABLE[Math.round(cg * 255)];
      const b = HEX_TABLE[Math.round(cb * 255)];
      parts.push(`<span style="color:#${r}${g}${b}">${char}</span>`);
    }
    parts.push('\n');
  }

  return parts.join('');
};

const HEX_TABLE: string[] = new Array(256);
const GAMMA_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  HEX_TABLE[i] = i.toString(16).padStart(2, '0');
  GAMMA_TABLE[i] = Math.pow(i / 255, 0.55);
}

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
