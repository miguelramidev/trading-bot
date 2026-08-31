import os
import asyncio
import logging
from dotenv import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from data_fetcher import DataFetcher
from strategy import PullbackStrategy
from bot_controller import BotController

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger('MainLoop')

load_dotenv()

# Instancias
fetcher = DataFetcher()
strategy = PullbackStrategy()
bot_controller = BotController()

async def analyze_and_send(timeframe):
    logger.info(f"[{timeframe}] Iniciando análisis de las Top 100 monedas...")
    
    # 1. Obtener Top 100 monedas
    top_pairs = fetcher.get_top_100_pairs()
    if not top_pairs:
        logger.error("No se pudieron obtener los pares.")
        return

    # 2. Correr la estrategia y encontrar la ganadora
    # Esto puede tardar unos segundos porque descarga datos de 100 monedas
    best_signal = strategy.run_competition(fetcher, top_pairs, timeframe)

    # 3. Enviar señal si existe y no está pausado
    if best_signal:
        logger.info(f"[{timeframe}] Ganadora encontrada: {best_signal['symbol']} (Score: {best_signal['score']:.4f})")
        await bot_controller.send_signal(timeframe, best_signal)
    else:
        logger.info(f"[{timeframe}] No se encontraron setups válidos en este momento.")


async def main():
    scheduler = AsyncIOScheduler()
    
    # --- Configurar Cronjobs ---
    # 15m: Minutos 0, 15, 30, 45 a los 10 segundos
    scheduler.add_job(
        analyze_and_send, 
        'cron', 
        minute='0,15,30,45', 
        second='10', 
        args=['15m'],
        id='job_15m'
    )
    
    # 1h: Minuto 0 a los 10 segundos
    scheduler.add_job(
        analyze_and_send, 
        'cron', 
        minute='0', 
        second='10', 
        args=['1h'],
        id='job_1h'
    )
    
    # 4h: Horas 0, 4, 8, 12, 16, 20 en el minuto 0 a los 10 segundos
    scheduler.add_job(
        analyze_and_send, 
        'cron', 
        hour='0,4,8,12,16,20', 
        minute='0', 
        second='10', 
        args=['4h'],
        id='job_4h'
    )

    scheduler.start()
    logger.info("Scheduler iniciado. Esperando cierres de vela...")
    
    # Iniciar el bot de Telegram (esto bloquea y mantiene el proceso vivo)
    # Nota: run_polling maneja su propio event loop, por lo que tenemos que usar 
    # initialize() y start() manualmente o correr el scheduler antes.
    # Afortunadamente run_polling() puede correr sobre el event loop actual.
    await bot_controller.application.initialize()
    await bot_controller.application.start()
    await bot_controller.application.updater.start_polling()
    
    # Mantener vivo indefinidamente
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Bot detenido por el usuario.")
