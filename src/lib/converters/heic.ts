/**
 * HEIC decoder via heic2any.
 * Returns an intermediate decoded PNG Blob that the dispatcher feeds back
 * through the normal pipeline. This is not a full converter.
 *
 * This module is lazy-loaded by the dispatcher — never import it at the top level.
 */

/**
 * Decode a HEIC/HEIF file to a PNG Blob.
 * The resulting blob can be wrapped in a File and piped through canvas/avif/gif converters.
 */
export async function decodeHeic(file: File): Promise<Blob> {
  // Dynamic import — never pulled into the main bundle
  const heic2any = (await import('heic2any')).default;

  const result = await heic2any({
    blob: file,
    toType: 'image/png',
    quality: 1,
  });

  // heic2any returns Blob | Blob[] depending on whether `multiple` is set.
  // Without `multiple: true`, it returns a single Blob.
  if (Array.isArray(result)) {
    return result[0]!;
  }
  return result;
}
