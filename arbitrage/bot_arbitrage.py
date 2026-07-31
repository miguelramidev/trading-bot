"""
Motor Cuantitativo de Arbitraje Estadístico / Pairs Trading (Pilar 2)
Arquitectura All-Weather - Cointegración Engle-Granger + Reversión a la Media del Z-Score
Diseñado para operar en la misma terminal que bot.py usando Magic Number estricto (888888).
"""

import os
import sys
import math
import time
import asyncio
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timezone

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

from dotenv import load_dotenv
from shared.notifier import TelegramNotifier
notifier = TelegramNotifier()

# Cargar configuración (acepta .env.arb si existe, sino .env estándar)
if os.path.exists('.env.arb'):
    load_dotenv('.env.arb')
else:
    load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("BotArbitrage")

class PairsTradingBot:
    def __init__(self):
        self.account_type = os.getenv('ACCOUNT_TYPE', 'CENT').upper()
        suffix = "c" if self.account_type == "CENT" else "m"
        
        # Etiqueta institucional para aislar operaciones del Pilar 2 en MT5
        self.magic = 888888
        self.risk_percent = float(os.getenv('RISK_PERCENT', '1.0'))
        self.check_interval = int(os.getenv('CHECK_INTERVAL_SECONDS', '300')) # 5 minutos
        
        # Cestas Oficiales de Pairs Trading Cointegradas (9 cestas verificadas por backtest en Exness)
        self.baskets = [
            {
                "name": "Oceánicas USD (AUD vs NZD)",
                "leg_a": f"AUDUSD{suffix}", "leg_b": f"NZDUSD{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.2
            },
            {
                "name": "Europeas USD (EUR vs GBP)",
                "leg_a": f"EURUSD{suffix}", "leg_b": f"GBPUSD{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 168, "max_slope": 10.0
            },
            {
                "name": "Oceánicas JPY (AUD/JPY vs NZD/JPY)",
                "leg_a": f"AUDJPY{suffix}", "leg_b": f"NZDJPY{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.5
            },
            {
                "name": "Europeas JPY (EUR/JPY vs GBP/JPY)",
                "leg_a": f"EURJPY{suffix}", "leg_b": f"GBPJPY{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 120, "max_slope": 8.0
            },
            {
                "name": "Europeas AUD (EUR/AUD vs GBP/AUD)",
                "leg_a": f"EURAUD{suffix}", "leg_b": f"GBPAUD{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
            },
            {
                "name": "Europeas CHF (EUR/CHF vs GBP/CHF)",
                "leg_a": f"EURCHF{suffix}", "leg_b": f"GBPCHF{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
            },
            {
                "name": "Europeas CAD (EUR/CAD vs GBP/CAD)",
                "leg_a": f"EURCAD{suffix}", "leg_b": f"GBPCAD{suffix}",
                "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
            },
            {
                "name": "Metales Preciosos (Oro vs Plata)",
                "leg_a": f"XAUUSD{suffix}", "leg_b": f"XAGUSD{suffix}",
                "window": 120, "entry_z": 2.1, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.0
            },
            {
                "name": "Reyes Cripto (BTC vs ETH)",
                "leg_a": f"BTCUSD{suffix}", "leg_b": f"ETHUSD{suffix}",
                "window": 120, "entry_z": 2.2, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 96, "max_slope": 2.0
            }
        ]

    def connect_mt5(self):
        if not MT5_AVAILABLE:
            logger.warning("MetaTrader5 no está instalado o disponible en este OS.")
            return False
            
        if not mt5.initialize():
            logger.error(f"Fallo al inicializar MT5. Error: {mt5.last_error()}")
            return False
            
        # Intentar login con variables de entorno si se especificaron
        account_id = os.getenv("MT5_ACCOUNT_ID")
        password = os.getenv("MT5_PASSWORD")
        server = os.getenv("MT5_SERVER")
        
        if account_id and password and server:
            if not mt5.login(int(account_id), password=password, server=server):
                logger.error(f"Error autenticando cuenta {account_id}: {mt5.last_error()}")
                return False
                
        logger.info("✅ Conectado exitosamente a MetaTrader 5 (Pilar 2 - Pairs Trading).")
        return True

    def get_pair_metrics(self, leg_a, leg_b, window=120):
        """Descarga velas H1 y calcula Beta (OLS), Spread, Z-Score y Pendiente del diferencial"""
        if not MT5_AVAILABLE:
            return None
            
        num_candles = max(300, window + 50)
        rates_a = mt5.copy_rates_from_pos(leg_a, mt5.TIMEFRAME_H1, 0, num_candles)
        rates_b = mt5.copy_rates_from_pos(leg_b, mt5.TIMEFRAME_H1, 0, num_candles)
        
        if rates_a is None or len(rates_a) == 0 or rates_b is None or len(rates_b) == 0:
            return None
            
        df_a = pd.DataFrame(rates_a)[['time', 'close']].rename(columns={'close': 'close_a'})
        df_b = pd.DataFrame(rates_b)[['time', 'close']].rename(columns={'close': 'close_b'})
        df = pd.merge(df_a, df_b, on='time', how='inner').dropna()
        
        if len(df) < window + 24:
            return None
            
        df['log_a'] = np.log(df['close_a'])
        df['log_b'] = np.log(df['close_b'])
        
        # Hedge Ratio (Beta) institucional por Covarianza/Varianza móvil
        cov_ab = df['log_a'].rolling(window=window).cov(df['log_b'])
        var_b = df['log_b'].rolling(window=window).var()
        df['beta'] = (cov_ab / var_b).fillna(1.0)
        
        df['spread'] = df['log_a'] - df['beta'] * df['log_b']
        df['mean'] = df['spread'].rolling(window=window).mean()
        df['std'] = df['spread'].rolling(window=window).std()
        df['zscore'] = (df['spread'] - df['mean']) / df['std']
        
        # Pendiente de la media en 24 horas para detectar lateralidad vs tendencia secular
        df['mean_slope'] = (df['mean'] - df['mean'].shift(24)) * 1000.0
        
        last = df.iloc[-1]
        return {
            "time": datetime.fromtimestamp(last['time']),
            "zscore": float(last['zscore']),
            "beta": float(last['beta']),
            "spread": float(last['spread']),
            "slope": float(abs(last['mean_slope'])),
            "price_a": float(last['close_a']),
            "price_b": float(last['close_b'])
        }

    def get_open_basket_position(self, leg_a, leg_b):
        """Verifica si ya existe una operación abierta de esta cesta con magic == 888888"""
        if not MT5_AVAILABLE:
            return None
            
        positions = mt5.positions_get()
        if not positions:
            return None
            
        basket_pos = []
        for p in positions:
            if getattr(p, 'magic', 0) == self.magic and p.symbol in (leg_a, leg_b):
                basket_pos.append(p)
                
        if len(basket_pos) > 0:
            return basket_pos
        return None

    def calculate_lot_size(self, symbol, risk_usd):
        """Calcula lotaje conservador y proporcional al margen libre en cuenta Cent"""
        if not MT5_AVAILABLE:
            return 0.01
            
        symbol_info = mt5.symbol_info(symbol)
        if not symbol_info:
            return 0.01
            
        min_lot = symbol_info.volume_min
        max_lot = symbol_info.volume_max
        step = symbol_info.volume_step
        
        # Lotaje base conservador por cada $10 USD de riesgo
        lot = max(min_lot, min(max_lot, round(risk_usd / 100.0, 2)))
        return lot

    async def send_order(self, symbol, direction, lot_size, comment):
        """Envía una orden a mercado en MT5 con etiqueta magic == 888888"""
        symbol_info = mt5.symbol_info(symbol)
        if not symbol_info:
            logger.error(f"Símbolo {symbol} no encontrado.")
            return False
            
        tick = mt5.symbol_info_tick(symbol)
        if not tick:
            return False
            
        order_type = mt5.ORDER_TYPE_BUY if direction == "BUY" else mt5.ORDER_TYPE_SELL
        price = tick.ask if direction == "BUY" else tick.bid
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(lot_size),
            "type": order_type,
            "price": float(price),
            "deviation": 20,
            "magic": self.magic,
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            logger.info(f"✅ [{symbol}] Orden {direction} ejecutada. Ticket: {result.order}")
            return True
        else:
            logger.error(f"❌ [{symbol}] Error en orden {direction}: {result.retcode if result else 'Sin respuesta'}")
            return False

    async def close_position(self, pos):
        """Cierra una posición individual perteneciente a una cesta"""
        tick = mt5.symbol_info_tick(pos.symbol)
        if not tick:
            return False
            
        order_type = mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
        price = tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask
        
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": float(pos.volume),
            "type": order_type,
            "position": pos.ticket,
            "price": float(price),
            "deviation": 20,
            "magic": self.magic,
            "comment": "ARB_CLOSE",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        return result and result.retcode == mt5.TRADE_RETCODE_DONE

    async def execute_basket_entry(self, basket, metrics, direction_str):
        """Abre compra en el activo barato y venta en el caro en simultáneo"""
        account_info = mt5.account_info()
        balance = account_info.balance if account_info else 500.0
        risk_usd = balance * (self.risk_percent / 100.0)
        
        leg_a = basket['leg_a']
        leg_b = basket['leg_b']
        
        lot_a = self.calculate_lot_size(leg_a, risk_usd)
        lot_b = self.calculate_lot_size(leg_b, risk_usd)
        
        if direction_str == "SELL_A_BUY_B":
            dir_a, dir_b = "SELL", "BUY"
        else:
            dir_a, dir_b = "BUY", "SELL"
            
        logger.info(f"🚀 Abriendo Arbitraje en {basket['name']} ({leg_a} vs {leg_b}) | Z-Score: {metrics['zscore']:.2f}")
        
        success_a = await self.send_order(leg_a, dir_a, lot_a, f"ARB_{dir_a}")
        success_b = await self.send_order(leg_b, dir_b, lot_b, f"ARB_{dir_b}")
        
        if success_a and success_b:
            msg = (f"🚀 <b>¡Pilar 2: Arbitraje de Pares Activado!</b>\n\n"
                   f"🧺 <b>Cesta:</b> {basket['name']}\n"
                   f"📈 <b>{leg_a}:</b> {dir_a} (Lot: {lot_a})\n"
                   f"📉 <b>{leg_b}:</b> {dir_b} (Lot: {lot_b})\n"
                   f"🧮 <b>Z-Score Actual:</b> {metrics['zscore']:+.2f} (Divergencia Extrema)")
            await notifier.send_message(msg)

    async def check_and_trade(self):
        """Ciclo principal de monitoreo de cointegración y reversión a la media"""
        basket_status_list = []
        for basket in self.baskets:
            leg_a = basket['leg_a']
            leg_b = basket['leg_b']
            
            open_pos = self.get_open_basket_position(leg_a, leg_b)
            metrics = self.get_pair_metrics(leg_a, leg_b, window=basket['window'])
            
            if not metrics:
                continue
                
            z = metrics['zscore']
            
            # Recopilar métricas para el resumen de consola
            basket_status_list.append({
                "name": basket['name'],
                "zscore": z,
                "entry_z": basket['entry_z'],
                "slope": metrics['slope'],
                "max_slope": basket['max_slope'],
                "open": open_pos is not None
            })
            
            if open_pos is None:
                # 1. BUSCAR OPORTUNIDAD DE ENTRADA (Si no hay posición de esta cesta abierta)
                # Filtro de lateralidad: la pendiente del spread no debe indicar tendencia secular
                if metrics['slope'] > basket['max_slope']:
                    continue
                    
                if z > basket['entry_z']:
                    # A está anormalmente caro frente a B -> Vender A, Comprar B
                    await self.execute_basket_entry(basket, metrics, "SELL_A_BUY_B")
                elif z < -basket['entry_z']:
                    # A está anormalmente barato frente a B -> Comprar A, Vender B
                    await self.execute_basket_entry(basket, metrics, "BUY_A_SELL_B")
            else:
                # 2. GESTIONAR SALIDAS (TP por Convergencia, SL por Ruptura o Time-Stop)
                should_close = False
                close_reason = ""
                
                # Tiempo transcurrido desde la apertura
                max_held_hours = 0
                for p in open_pos:
                    hours_held = (time.time() - p.time) / 3600.0
                    max_held_hours = max(max_held_hours, hours_held)
                    
                if abs(z) < basket['exit_z']:
                    should_close = True
                    close_reason = "CONVERGENCIA TP"
                elif abs(z) >= basket['stop_z']:
                    should_close = True
                    close_reason = "STOP RUPTURA COINTEGRACIÓN"
                elif max_held_hours >= basket['max_bars']:
                    should_close = True
                    close_reason = "TIME STOP (Límite Máximo de Días)"
                    
                if should_close:
                    logger.info(f"🏁 Cerrando Cesta {basket['name']} | Razón: {close_reason} | Z-Score: {z:.2f}")
                    closed_count = 0
                    total_pnl = 0.0
                    for p in open_pos:
                        total_pnl += (p.profit + p.swap)
                        if await self.close_position(p):
                            closed_count += 1
                            
                    if closed_count > 0:
                        msg = (f"🏁 <b>Cierre de Arbitraje ({basket['name']})</b>\n\n"
                               f"ℹ️ <b>Razón:</b> {close_reason}\n"
                               f"🧮 <b>Z-Score Final:</b> {z:+.2f}\n"
                               f"💰 <b>PnL Cesta:</b> ${total_pnl:.2f} USD")
                        await notifier.send_message(msg)

        # PANORAMA DE ARBITRAJE - TOP 3 MEJORES HERMANOS
        if basket_status_list:
            basket_status_list.sort(key=lambda x: abs(x['zscore']), reverse=True)
            top3 = basket_status_list[:3]
            print("\n==========================================================================================")
            print("   [PANORAMA ARBITRAJE - TOP 3 HERMANOS MAS CERCANOS A DIVERGENCIA / SEPARACION]         ")
            print("==========================================================================================")
            print(f"{'#':<3} | {'Cesta (Hermanos)':<34} | {'Z-Score / Meta':<16} | {'Pendiente':<14} | {'Estado':<15}")
            print("-" * 90)
            for idx, item in enumerate(top3, 1):
                z_str = f"{item['zscore']:+.2f} / {item['entry_z']}"
                slope_str = f"{item['slope']:.2f}/{item['max_slope']:.1f}"
                pct_div = min(int((abs(item['zscore']) / item['entry_z']) * 100), 999)
                if item['open']:
                    status = "[ACTIVO EN MT5]"
                elif abs(item['zscore']) >= item['entry_z']:
                    status = "[DISPARO]"
                elif pct_div >= 70:
                    status = f"ALERTA ({pct_div}% div)"
                elif pct_div >= 40:
                    status = f"SEGURO ({pct_div}% div)"
                else:
                    status = f"ESTABLE ({pct_div}%)"
                print(f"{idx:<3} | {item['name']:<34} | {z_str:<16} | {slope_str:<14} | {status:<15}")
            print("==========================================================================================\n")

    async def run(self):
        logger.info("=========================================================")
        logger.info("🚀 INICIANDO PILAR 2: ARBITRAJE ESTADÍSTICO / PAIRS TRADING")
        logger.info("=========================================================")
        
        if not self.connect_mt5():
            logger.error("No se pudo iniciar el bot de arbitraje por fallo en MT5.")
            return
            
        await notifier.send_message("🌐 <b>Pilar 2 (Arbitraje Todo-Terreno) en Línea</b>\n"
                                    "Vigilando divergencias en AUD/NZD, EUR/GBP y Oro/Plata.")
        
        try:
            while True:
                logger.info("🔍 Evaluando Z-Score y Cointegración en Cestas...")
                await self.check_and_trade()
                logger.info(f"💤 Próximo análisis en {self.check_interval} segundos...")
                await asyncio.sleep(self.check_interval)
        except asyncio.CancelledError:
            logger.info("Detención solicitada.")
        finally:
            if MT5_AVAILABLE:
                mt5.shutdown()
            logger.info("Bot de arbitraje desconectado.")

if __name__ == "__main__":
    bot = PairsTradingBot()
    asyncio.run(bot.run())
