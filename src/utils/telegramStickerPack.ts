import { Telegraf } from 'telegraf';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { makeStickerBuffer } from './stickerUtils';

/**
 * Create a new Telegram sticker pack for a user.
 * @param bot Telegraf bot instance
 * @param userId Telegram user ID (owner of the pack)
 * @param packName Unique sticker pack name (must end with _by_<botusername>)
 * @param packTitle Human-readable title for the sticker pack
 * @param stickerPath Path to the PNG sticker file (512x512, <512KB, transparent)
 * @param emojis Emoji(s) associated with the sticker
 */
export async function createTelegramStickerPack(
  bot: Telegraf<any>,
  userId: number,
  packName: string,
  packTitle: string,
  stickerPath: string,
  emojis: string
) {
  try {
    console.log('[StickerPack] Start creating sticker pack');
    console.log(`[StickerPack] Reading file: ${stickerPath}`);
    const inputBuffer = fs.readFileSync(stickerPath);
    console.log('[StickerPack] Processing image buffer to Telegram sticker format');
    const processedBuffer = await makeStickerBuffer(inputBuffer);
    const tempPath = path.join(os.tmpdir(), `processed-sticker-${Date.now()}.png`);
    console.log(`[StickerPack] Writing processed sticker to temp file: ${tempPath}`);
    fs.writeFileSync(tempPath, processedBuffer);
    const stickerData = {
      png_sticker: { source: fs.createReadStream(tempPath) },
      emojis
    };
    console.log('[StickerPack] Calling Telegram API to create new sticker set');
    await bot.telegram.createNewStickerSet(
      userId,
      packName,
      packTitle,
      stickerData as unknown as Parameters<typeof bot.telegram.createNewStickerSet>[3]
    );
    console.log('[StickerPack] Sticker pack created!');
    fs.unlinkSync(tempPath);
    console.log('[StickerPack] Temp file deleted');
  } catch (err) {
    console.error('[StickerPack] Error in createTelegramStickerPack:', err);
    throw err;
  }
}

/**
 * Add a sticker to an existing Telegram sticker pack.
 * @param bot Telegraf bot instance
 * @param userId Telegram user ID (owner of the pack)
 * @param packName Name of the sticker pack
 * @param stickerPath Path to the PNG sticker file (512x512, <512KB, transparent)
 * @param emojis Emoji(s) associated with the sticker
 */
export async function addStickerToPack(
  bot: Telegraf<any>,
  userId: number,
  packName: string,
  stickerPath: string,
  emojis: string
) {
  try {
    console.log('[StickerPack] Start adding sticker to pack');
    console.log(`[StickerPack] Reading file: ${stickerPath}`);
    const inputBuffer = fs.readFileSync(stickerPath);
    console.log('[StickerPack] Processing image buffer to Telegram sticker format');
    const processedBuffer = await makeStickerBuffer(inputBuffer);
    const tempPath = path.join(os.tmpdir(), `processed-sticker-${Date.now()}.png`);
    console.log(`[StickerPack] Writing processed sticker to temp file: ${tempPath}`);
    fs.writeFileSync(tempPath, processedBuffer);
    const stickerData = {
      png_sticker: { source: fs.createReadStream(tempPath) },
      emojis
    };
    console.log('[StickerPack] Calling Telegram API to add sticker to set');
    await bot.telegram.addStickerToSet(
      userId,
      packName,
      stickerData as unknown as Parameters<typeof bot.telegram.addStickerToSet>[2]
    );
    console.log('[StickerPack] Sticker added!');
    fs.unlinkSync(tempPath);
    console.log('[StickerPack] Temp file deleted');
  } catch (err) {
    console.error('[StickerPack] Error in addStickerToPack:', err);
    throw err;
  }
}

/**
 * Example usage:
 *
 * import { Telegraf } from 'telegraf';
 * import { createTelegramStickerPack, addStickerToPack } from './utils/telegramStickerPack';
 *
 * const bot = new Telegraf('<your-bot-token>');
 * const userId = <telegram-user-id>;
 * const packName = 'my_starter_pack_by_yourbot';
 * const packTitle = 'My Starter Pack';
 * const stickerPath = './test-output-sticker.png';
 * const emojis = '😎';
 *
 * // Create a new sticker pack
 * await createTelegramStickerPack(bot, userId, packName, packTitle, stickerPath, emojis);
 *
 * // Add another sticker
 * await addStickerToPack(bot, userId, packName, './another-sticker.png', '🚀');
 */ 