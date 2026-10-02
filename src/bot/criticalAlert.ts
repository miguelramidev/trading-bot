import { Telegram } from "telegraf";
import { Resource } from "sst";
import { sendPushNotificationAndPrune } from "../firebase.js";

function getTelegramToken(): string | undefined {
  return process.env.TELEGRAM_TOKEN || (Resource as any).TELEGRAM_TOKEN?.value;
}

// Alerta de estado "critico" (posición abierta sin protección): se dispara siempre, sin importar
// si la orden se ejecutó desde el bot de Telegram o desde la app (SignalController no tiene un
// chat de Telegram propio, así que ambos llamadores usan este helper con los datos del mismo
// usuario en userConfig). Si el usuario nunca vinculó Telegram, chatId viene null y solo se
// manda el push.
export async function sendCriticalAlert(
  userId: number,
  chatId: string | null | undefined,
  fcmTokens: string[] | null | undefined,
  mensaje: string
): Promise<void> {
  if (chatId) {
    try {
      const token = getTelegramToken();
      if (!token) {
        console.error("[criticalAlert] TELEGRAM_TOKEN no configurado: no se pudo alertar por Telegram.");
      } else {
        await new Telegram(token).sendMessage(chatId, mensaje, { parse_mode: "HTML" });
      }
    } catch (e: any) {
      console.error("[criticalAlert] Falló el aviso por Telegram:", e.message);
    }
  } else {
    console.warn("[criticalAlert] El usuario no tiene chatId de Telegram vinculado: no se pudo alertar por ese canal.");
  }

  const plainText = mensaje.replace(/<[^>]+>/g, "");
  for (const token of fcmTokens || []) {
    await sendPushNotificationAndPrune(userId, token, "🚨 Alerta crítica de trading", plainText);
  }
}
