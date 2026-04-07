/**
 * Image handler for vision-capable models.
 * Converts clipboard/dropped images to model ContentBlocks.
 */

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface ImageBlock {
  type: 'image';
  mediaType: ImageMediaType;
  data: string; // base64, no prefix
}

const SUPPORTED_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function processImageDataUrl(dataUrl: string): ImageBlock {
  const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL format');
  const mediaType = match[1] as ImageMediaType;
  const base64 = match[2];
  if (!SUPPORTED_TYPES.includes(mediaType)) {
    throw new Error(`Unsupported image type: ${mediaType}. Supported: ${SUPPORTED_TYPES.join(', ')}`);
  }
  const sizeBytes = Math.ceil(base64.length * 0.75);
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error(`Image too large: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB (max 5MB)`);
  }
  return { type: 'image', mediaType, data: base64 };
}

export function imageBlockToAnthropicContent(block: ImageBlock): Record<string, unknown> {
  return {
    type: 'image',
    source: { type: 'base64', media_type: block.mediaType, data: block.data }
  };
}

export function imageBlockToOpenAIContent(block: ImageBlock): Record<string, unknown> {
  return {
    type: 'image_url',
    image_url: { url: `data:${block.mediaType};base64,${block.data}`, detail: 'auto' }
  };
}

export function imageBlockToGeminiContent(block: ImageBlock): Record<string, unknown> {
  return {
    inlineData: { mimeType: block.mediaType, data: block.data }
  };
}
