import requests
import logging
import asyncio
from shared.config import TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

logger = logging.getLogger("TelegramNotifier")

class TelegramNotifier:
    def __init__(self):
        self.token = TELEGRAM_BOT_TOKEN
        self.chat_id = TELEGRAM_CHAT_ID
        self.base_url = f"https://api.telegram.org/bot{self.token}/sendMessage"
        
        if not self.token or not self.chat_id:
            logger.warning("Telegram credentials not found. Notifications are disabled.")

    def send_message_sync(self, text):
        """Sends a message synchronously (blocking)"""
        if not self.token or not self.chat_id:
            return
            
        try:
            payload = {
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": "HTML"
            }
            response = requests.post(self.base_url, json=payload, timeout=10)
            response.raise_for_status()
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")

    async def send_message(self, text):
        """Sends a message asynchronously so it doesn't block trading loops"""
        if not self.token or not self.chat_id:
            return
            
        # Run the synchronous request in a background thread
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.send_message_sync, text)

# Global instance for easy importing
notifier = TelegramNotifier()
