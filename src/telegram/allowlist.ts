import { parseAllowlist } from "../api/core/utils/allowlist.js";

// Solo los chats de la lista de permitidos pueden interactuar con el bot.
// Falla cerrado: sin lista configurada (o vacía) no se permite ningún chat.
export function isAllowedChat(chatId: number | string | undefined, rawAllowlist: string | undefined): boolean {
  if (chatId === undefined || chatId === null) return false;
  return parseAllowlist(rawAllowlist).has(String(chatId));
}
