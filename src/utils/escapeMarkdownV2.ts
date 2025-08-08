// Escapes all special characters for Telegram MarkdownV2
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[\\_\*\[\]\(\)~`>#+\-=|{}\.!]/g, (match) => `\\${match}`);
} 