import os
from dotenv import load_dotenv

load_dotenv()

# Binance Config
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_SECRET_KEY = os.getenv("BINANCE_SECRET_KEY", "")
BINANCE_TESTNET = os.getenv("BINANCE_TESTNET", "True").lower() in ("true", "1", "yes")

# Traditional Broker Config
TRAD_BROKER_API_KEY = os.getenv("TRAD_BROKER_API_KEY", "")
TRAD_BROKER_SECRET = os.getenv("TRAD_BROKER_SECRET", "")
TRAD_BROKER_ACCOUNT = os.getenv("TRAD_BROKER_ACCOUNT", "")

# General Config
MAX_LEVERAGE = int(os.getenv("MAX_LEVERAGE", "10"))

# Telegram Config
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
