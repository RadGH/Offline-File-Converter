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

export type ConverterFn = (
  input: ConversionInput,
  onProgress?: (pct: number) => void
) => Promise<ConversionResult>;
