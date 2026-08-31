import os
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

class BotController:
    def __init__(self):
        self.token = os.getenv('TELEGRAM_TOKEN')
        self.chat_id = os.getenv('TELEGRAM_CHAT_ID')
        self.is_paused = False
        self.application = Application.builder().token(self.token).build()
        self._setup_handlers()

    def _setup_handlers(self):
        self.application.add_handler(CommandHandler("start", self.start_command))
        self.application.add_handler(CommandHandler("pause", self.pause_command))
        self.application.add_handler(CommandHandler("resume", self.resume_command))
        self.application.add_handler(CommandHandler("status", self.status_command))

    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.message.reply_text("🤖 Crypto Signal Bot iniciado.\nUsa /pause para detener las alertas y /resume para reanudarlas.")

    async def pause_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        self.is_paused = True
        await update.message.reply_text("⏸️ Bot pausado. No recibirás más señales hasta que uses /resume.")

    async def resume_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        self.is_paused = False
        await update.message.reply_text("▶️ Bot reanudado. Recibirás señales en los cierres de vela.")

    async def status_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        status = "Pausado ⏸️" if self.is_paused else "Activo ▶️"
        await update.message.reply_text(f"Estado del bot: {status}")

    async def send_signal(self, timeframe, signal_data):
        if self.is_paused:
            return

        symbol = signal_data['symbol']
        entry = signal_data['entry']
        sl = signal_data['stop_loss']
        tp = signal_data['take_profit']
        current = signal_data['current_price']
        distance = signal_data['distance_pct']

        message = (
            f"🔔 <b>SEÑAL SPOT GANADORA ({timeframe})</b> 🔔\n\n"
            f"🪙 <b>Par:</b> {symbol}\n"
            f"📊 <b>Estrategia:</b> Pullback a Soporte\n"
            f"💵 <b>Precio Actual:</b> {current:.4f} (-{distance:.2f}% hasta entrada)\n\n"
            f"📝 <b>PLAN DE TRADING (Ratio 1:3)</b>\n"
            f"🛒 <b>Compra Limit:</b> {entry:.4f}\n"
            f"🛑 <b>Stop Loss:</b> {sl:.4f}\n"
            f"🎯 <b>Take Profit:</b> {tp:.4f}\n\n"
            f"<i>💡 Recuerda verificar la gráfica antes de colocar la orden.</i>"
        )

        try:
            await self.application.bot.send_message(
                chat_id=self.chat_id, 
                text=message, 
                parse_mode='HTML'
            )
        except Exception as e:
            print(f"Error sending message: {e}")
