"""
Orquestador Principal - Sistema All-Weather (Pilar 1 + Pilar 2)
Ejecuta de forma concurrente en una sola terminal MT5 y con un solo comando:
1. Motor Tendencial (TradTripleScreenBot - Magic: 777777)
2. Motor de Arbitraje Estadístico / Pairs Trading (PairsTradingBot - Magic: 888888)
"""

import os
import sys
import asyncio
import logging
from dotenv import load_dotenv

# Cargar variables globales
load_dotenv()

from trad_triple_screen.bot import TradTripleScreenBot
from arbitrage.bot_arbitrage import PairsTradingBot
from trad_triple_screen.notifier import notifier

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [%(name)s] - %(levelname)s - %(message)s'
)
logger = logging.getLogger("AllWeatherOrchestrator")

async def run_trend_pillar():
    """Ejecuta el ciclo asíncrono del Pilar 1 (Tendencias - 12 Símbolos Alfa)"""
    try:
        logger.info("🚀 Iniciando Pilar 1: Motor Tendencial Triple Pantalla (Magic 777777)...")
        trend_bot = TradTripleScreenBot()
        await trend_bot.run()
    except Exception as e:
        logger.error(f"❌ Error crítico en Pilar 1 (Tendencias): {e}", exc_info=True)

async def run_arbitrage_pillar():
    """Ejecuta el ciclo asíncrono del Pilar 2 (Arbitraje - 9 Cestas Cointegradas)"""
    try:
        logger.info("🧺 Iniciando Pilar 2: Motor de Arbitraje de Pares (Magic 888888)...")
        arb_bot = PairsTradingBot()
        await arb_bot.run()
    except Exception as e:
        logger.error(f"❌ Error crítico en Pilar 2 (Arbitraje): {e}", exc_info=True)

async def main():
    print("==============================================================================")
    print("        🚀 PORTAFOLIO ALL-WEATHER - INSTITUTIONAL MULTI-PILLAR BOT        ")
    print("       Pilar 1 (Tendencia 777777)  +  Pilar 2 (Arbitraje 888888)          ")
    print("==============================================================================")
    
    await notifier.send_message(
        "⚡ <b>SISTEMA ALL-WEATHER EN MARCHA</b>\n\n"
        "🟢 <b>Pilar 1 (Tendencia):</b> 12 Símbolos Alfa (Magic <code>777777</code>)\n"
        "🟣 <b>Pilar 2 (Arbitraje):</b> 9 Cestas Cointegradas (Magic <code>888888</code>)\n\n"
        "<i>Ambos motores cooperando sin interferencias en una misma cuenta MT5.</i>"
    )
    
    logger.info("⚡ Ejecutando ambos motores cuantitativos en paralelo (asyncio.gather)...")
    
    try:
        # Ejecutar en paralelo dentro del mismo proceso asyncio
        await asyncio.gather(
            run_trend_pillar(),
            run_arbitrage_pillar()
        )
    except asyncio.CancelledError:
        logger.info("🛑 Detención del sistema All-Weather solicitada.")
    except Exception as e:
        logger.error(f"❌ Error general en el orquestador: {e}", exc_info=True)
    finally:
        logger.info("🏁 Orquestador All-Weather finalizado.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Sistema detenido manualmente por el usuario (Ctrl+C).")
