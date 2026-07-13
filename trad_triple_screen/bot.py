import os
import time
import math
import asyncio
import logging
import pandas as pd
import pandas_ta as ta
from dotenv import load_dotenv
from shared.notifier import TelegramNotifier

# Configuración de Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("TripleScreenBot")

# Intentamos importar MetaTrader5. Si falla (porque estamos en Mac), mostramos un warning.
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False
    logger.warning("Librería MetaTrader5 no encontrada o no compatible con este SO. El bot no podrá conectarse localmente.")

load_dotenv()
notifier = TelegramNotifier()

class TradTripleScreenBot:
    def __init__(self):
        self.login = int(os.getenv('EXNESS_LOGIN', 0))
        self.password = os.getenv('EXNESS_PASSWORD', '')
        self.server = os.getenv('EXNESS_SERVER', '')
        
        # Símbolos a operar (Ejemplo)
        self.symbols = ["EURUSDm", "US30m", "XAUUSDm"] 
        self.risk_percent = 1.0 # Arriesgar 1% por operación
        
    def connect(self):
        """Inicializa la conexión con el terminal de MetaTrader 5"""
        if not MT5_AVAILABLE:
            logger.error("No se puede conectar: MetaTrader5 no está instalado.")
            return False
            
        logger.info(f"Conectando a MT5 en servidor {self.server} con cuenta {self.login}...")
        
        if not mt5.initialize():
            logger.error(f"Fallo al inicializar MT5. Error: {mt5.last_error()}")
            return False
            
        authorized = mt5.login(self.login, password=self.password, server=self.server)
        if authorized:
            logger.info("✅ Conexión exitosa a Exness vía MT5")
            account_info = mt5.account_info()
            if account_info:
                logger.info(f"Balance: {account_info.balance} {account_info.currency}")
            return True
        else:
            logger.error(f"❌ Fallo de autenticación en MT5. Error: {mt5.last_error()}")
            return False

    def fetch_data(self, symbol, timeframe, num_candles=100):
        """Descarga velas históricas desde MT5 y devuelve un DataFrame de pandas"""
        if not MT5_AVAILABLE:
            return None
            
        # Mapeo de temporalidades de MT5
        tf_map = {
            '15m': mt5.TIMEFRAME_M15,
            '1h': mt5.TIMEFRAME_H1,
            '4h': mt5.TIMEFRAME_H4
        }
        
        mt5_tf = tf_map.get(timeframe)
        rates = mt5.copy_rates_from_pos(symbol, mt5_tf, 0, num_candles)
        
        if rates is None or len(rates) == 0:
            logger.error(f"No se pudieron descargar datos para {symbol} en {timeframe}")
            return None
            
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        return df

    def analyze_screen_1(self, df):
        """
        Pantalla 1: Marea Macro (4 Horas)
        Usa 2 EMAs (13 y 26) para determinar la tendencia pesada.
        """
        df['ema_fast'] = ta.ema(df['close'], length=13)
        df['ema_slow'] = ta.ema(df['close'], length=26)
        
        last_row = df.iloc[-1]
        
        if last_row['ema_fast'] > last_row['ema_slow']:
            return 'BULLISH'
        elif last_row['ema_fast'] < last_row['ema_slow']:
            return 'BEARISH'
        
        return 'NEUTRAL'

    def analyze_screen_2(self, df, trend_screen_1):
        """
        Pantalla 2: La Ola (1 Hora)
        Usa el Force Index (EMA 2) para identificar retrocesos contra la marea.
        """
        # Calcular Force Index = Volume * (Close - Close_previous)
        df['close_prev'] = df['close'].shift(1)
        df['force_index_raw'] = df['tick_volume'] * (df['close'] - df['close_prev'])
        
        # Suavizar con EMA de 2 períodos (La fórmula de Elder)
        df['force_index'] = ta.ema(df['force_index_raw'], length=2)
        
        last_fi = df['force_index'].iloc[-1]
        
        # Si la marea es alcista, buscamos que el Force Index caiga por debajo de 0 (Retroceso)
        if trend_screen_1 == 'BULLISH' and last_fi < 0:
            return True # Señal de entrada válida (Comprar barato)
            
        # Si la marea es bajista, buscamos que el Force Index suba por encima de 0 (Rebote)
        if trend_screen_1 == 'BEARISH' and last_fi > 0:
            return True # Señal de entrada válida (Vender caro)
            
        return False

    def analyze_screen_3(self, df, trend_screen_1):
        """
        Pantalla 3: El Disparo (15 Minutos)
        Calcula el punto exacto para colocar la orden Buy Stop o Sell Stop.
        """
        last_candle = df.iloc[-1]
        
        if trend_screen_1 == 'BULLISH':
            # Buy Stop 1 pip (ej. 0.0001) por encima del máximo anterior
            entry_price = last_candle['high']
            stop_loss = last_candle['low'] # SL debajo del mínimo
            return {'side': 'buy_stop', 'entry': entry_price, 'sl': stop_loss}
            
        elif trend_screen_1 == 'BEARISH':
            # Sell Stop 1 pip por debajo del mínimo anterior
            entry_price = last_candle['low']
            stop_loss = last_candle['high'] # SL encima del máximo
            return {'side': 'sell_stop', 'entry': entry_price, 'sl': stop_loss}
            
        return None

    def calculate_lot_size(self, symbol, entry_price, stop_loss_price):
        """Calcula el tamaño del lote basado en un riesgo del 1% del balance"""
        if not MT5_AVAILABLE:
            return 0.01 # Lote mock para Mac
            
        account_info = mt5.account_info()
        symbol_info = mt5.symbol_info(symbol)
        
        if not account_info or not symbol_info:
            return 0.01
            
        balance = account_info.balance
        risk_amount = balance * (self.risk_percent / 100.0)
        
        # Distancia en ticks
        tick_size = symbol_info.trade_tick_size
        tick_value = symbol_info.trade_tick_value
        
        distance_ticks = abs(entry_price - stop_loss_price) / tick_size
        
        if distance_ticks == 0:
            return symbol_info.volume_min
            
        risk_per_lot = distance_ticks * tick_value
        
        if risk_per_lot == 0:
            return symbol_info.volume_min
            
        # Calcular lote
        lot_size = risk_amount / risk_per_lot
        
        # Normalizar a los pasos permitidos por el broker (ej. 0.01)
        step = symbol_info.volume_step
        lot_size = math.floor(lot_size / step) * step
        
        # Respetar mínimos y máximos
        lot_size = max(symbol_info.volume_min, min(lot_size, symbol_info.volume_max))
        
        return lot_size

    async def execute_trade(self, symbol, trade_setup, trend):
        """Envía la orden pendiente (Buy Stop / Sell Stop) a MT5"""
        side = trade_setup['side']
        entry = trade_setup['entry']
        sl = trade_setup['sl']
        
        # RR 1:2 -> Take Profit es el doble de la distancia del SL
        distance = abs(entry - sl)
        if side == 'buy_stop':
            tp = entry + (distance * 2)
            order_type = mt5.ORDER_TYPE_BUY_STOP
        else:
            tp = entry - (distance * 2)
            order_type = mt5.ORDER_TYPE_SELL_STOP
            
        lot_size = self.calculate_lot_size(symbol, entry, sl)
        
        logger.info(f"[{symbol}] Calculado Lote: {lot_size} | Entry: {entry} | SL: {sl} | TP: {tp}")
        
        if not MT5_AVAILABLE:
            logger.warning(f"Simulando ejecución en Mac: {side.upper()} {lot_size} lotes de {symbol}")
            return {'status': 'simulated', 'lot': lot_size, 'tp': tp}
            
        request = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": float(lot_size),
            "type": order_type,
            "price": float(entry),
            "sl": float(sl),
            "tp": float(tp),
            "deviation": 20,
            "magic": 777777,
            "comment": "TripleScreen",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logger.error(f"Error enviando orden a MT5: {result.comment}")
            return None
            
        return {'status': 'executed', 'lot': lot_size, 'tp': tp}

    async def run(self):
        """Bucle principal de análisis"""
        logger.info("Arrancando Bot Triple Pantalla...")
        if not self.connect():
            return
            
        # Bucle de análisis (se ejecutaría cada 15 minutos en producción)
        while True:
            for symbol in self.symbols:
                logger.info(f"Analizando {symbol}...")
                
                # 1. Analizar Marea (4H)
                df_4h = self.fetch_data(symbol, '4h')
                if df_4h is None: continue
                trend = self.analyze_screen_1(df_4h)
                
                if trend == 'NEUTRAL':
                    logger.info(f"[{symbol}] Marea neutral. Ignorando.")
                    continue
                    
                logger.info(f"[{symbol}] Pantalla 1 (4H) - Tendencia: {trend}")
                
                # 2. Analizar Ola (1H)
                df_1h = self.fetch_data(symbol, '1h')
                if df_1h is None: continue
                wave_signal = self.analyze_screen_2(df_1h, trend)
                
                if not wave_signal:
                    logger.info(f"[{symbol}] Pantalla 2 (1H) - Sin retroceso (Force Index no alineado).")
                    continue
                    
                logger.info(f"[{symbol}] Pantalla 2 (1H) - Retroceso detectado. Preparando disparo...")
                
                # 3. Analizar Disparo (15m)
                df_15m = self.fetch_data(symbol, '15m')
                if df_15m is None: continue
                trade_setup = self.analyze_screen_3(df_15m, trend)
                
                if trade_setup:
                    logger.warning(f"🚨 ALERTA TRIPLE PANTALLA: {symbol} 🚨")
                    
                    # Ejecutar Trade (o Simular en Mac)
                    exec_result = await self.execute_trade(symbol, trade_setup, trend)
                    
                    if exec_result:
                        tp_price = exec_result['tp']
                        lot = exec_result['lot']
                        mode = "🖥️ SIMULACIÓN (MAC)" if not MT5_AVAILABLE else "✅ ORDEN EJECUTADA (MT5)"
                        
                        # Notificar a Telegram
                        msg = (f"🎯 <b>Señal Triple Pantalla ({symbol})</b>\n"
                               f"{mode}\n\n"
                               f"🧭 <b>Marea (4H):</b> {trend}\n"
                               f"🌊 <b>Ola (1H):</b> Retroceso Confirmado (Force Index)\n"
                               f"🔫 <b>Disparo (15m):</b> {trade_setup['side'].upper()}\n\n"
                               f"💰 <b>Lotes:</b> {lot}\n"
                               f"📍 <b>Entrada (Stop Order):</b> {trade_setup['entry']}\n"
                               f"🛡️ <b>Stop Loss:</b> {trade_setup['sl']}\n"
                               f"🤑 <b>Take Profit (1:2):</b> {tp_price:.4f}")
                        await notifier.send_message(msg)
                    
            logger.info("Ciclo terminado. Durmiendo 15 minutos...")
            await asyncio.sleep(900) # 15 minutos

if __name__ == "__main__":
    bot = TradTripleScreenBot()
    asyncio.run(bot.run())
