import { db } from './src/db/index.js';
import { userConfig } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import { sendPushNotification } from './src/firebase.js';
import { Telegraf } from 'telegraf';
import { Resource } from 'sst';

async function main() {
  try {
    const user = await db.query.userConfig.findFirst({ where: eq(userConfig.chatId, '769581187') });
    if (!user) { console.log('Usuario no encontrado'); return; }
    
    console.log('Enviando Telegram...');
    const bot = new Telegraf((Resource as any).TELEGRAM_TOKEN.value);
    await bot.telegram.sendMessage(user.chatId, '✅ <b>Ping Exitoso:</b> Tu bot ha sido migrado a Multi-Tenant (SaaS) y está conectado a tus API Keys de la app.', { parse_mode: 'HTML' });
    
    console.log('Enviando FCM...');
    if (user.fcmTokens && user.fcmTokens.length > 0) {
      for (const t of user.fcmTokens) {
        await sendPushNotification(t, 'Bot Actualizado ✅', 'El bot ahora opera de forma aislada con tus fondos.');
      }
    } else {
      console.log('No tiene FCM tokens (Inicia sesión en la App en el móvil nuevamente).');
    }
    console.log('Prueba finalizada.');
  } catch (e) { console.error('Error:', e); }
  process.exit(0);
}
main();
