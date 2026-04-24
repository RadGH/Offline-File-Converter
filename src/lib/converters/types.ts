import type { PerFileSettings, OutputFormat } from '@/lib/queue/store';

export interface ConversionInput {
  file: File;
  settings: PerFileSettings;
  originalDimensions?: { width: number; height: number };
}

export interface ConversionResult {
  blob: Blob;
  outName: string;
  outSize: number;
  outWidth: number;
  outHeight: number;
  outFormat: OutputFormat;
}

/** Third-argument options bag passed by the processor into convert(). */
export interface ConvertOptions {
  upscaleServices?: {
    isModelReady: () => boolean;
    runUpscale: (blob: Blob, scale: 2 | 4, onProgress?: (pct: number) => void) => Promise<Blob>;
  };
  onUpscaled?: (factor: 2 | 4) => void;
  onUpscaleStart?: () => void;
  onUpscaleEnd?: () => void;
}

export type ConverterFn = (
  input: ConversionInput,
  onProgress?: (pct: number) => void,
  options?: ConvertOptions,
) => Promise<ConversionResult>;
