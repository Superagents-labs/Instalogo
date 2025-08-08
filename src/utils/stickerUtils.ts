import sharp from 'sharp';

/**
 * Ensures the image buffer is a PNG, 512x512, and <512KB for Telegram stickers.
 * Will resize, convert, and compress as needed.
 * @param inputBuffer The input image buffer
 * @returns Promise<Buffer> The processed sticker buffer
 */
export async function makeStickerBuffer(inputBuffer: Buffer): Promise<Buffer> {
  let output = await sharp(inputBuffer)
    .resize(512, 512, { fit: 'cover' })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Reduce quality if still too large
  let quality = 90;
  while (output.length >= 512 * 1024 && quality > 10) {
    output = await sharp(output)
      .png({ compressionLevel: 9, quality })
      .toBuffer();
    quality -= 10;
  }

  // If still too large, try reducing colors (quantization)
  if (output.length >= 512 * 1024) {
    output = await sharp(output)
      .png({ compressionLevel: 9, quality: 10, palette: true })
      .toBuffer();
  }

  // Final check
  if (output.length >= 512 * 1024) {
    throw new Error('Unable to reduce sticker below 512KB');
  }

  return output;
} 