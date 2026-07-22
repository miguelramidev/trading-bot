import os
import time
import math
import asyncio
import logging
from datetime import datetime, timedelta
import pandas as pd
import pandas_ta as ta
from dotenv import load_dotenv
from shared.notifier import TelegramNotifier
from shared.db import init_db, log_trade, get_last_close_time

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
        
        self.account_type = os.getenv('ACCOUNT_TYPE', 'CENT').upper()
        suffix = "c" if self.account_type == "CENT" else "m"
        
        # Símbolos a operar (Cuenta Exness)
        self.symbols = [
            f"EURUSD{suffix}", f"GBPUSD{suffix}", f"USDJPY{suffix}", f"XAUUSD{suffix}", 
            f"US30{suffix}", f"US500{suffix}", f"USTEC{suffix}", f"USDCAD{suffix}", 
            f"AUDUSD{suffix}", f"GBPJPY{suffix}", f"BTCUSD{suffix}", f"ETHUSD{suffix}"
        ] 
        self.risk_percent = 1.0 # Riesgo fijo institucional del 1%
        self.active_trades = {} # Para simulación de estado en Mac
        self.tracked_positions = {} # Para rastrear PnL y ROI de operaciones abiertas
        
        # Inicializar Base de Datos
        init_db()
        
    def has_active_trade(self, symbol):
        """Verifica si ya hay una posición abierta o una orden pendiente para este símbolo"""
        if not MT5_AVAILABLE:
            return self.active_trades.get(symbol, False)
            
        # Revisar posiciones abiertas (trades activos)
        positions = mt5.positions_get(symbol=symbol)
        if positions is not None and len(positions) > 0:
            return True
            
        # Revisar órdenes pendientes (limit / stop orders)
        orders = mt5.orders_get(symbol=symbol)
        if orders is not None and len(orders) > 0:
            return True
            
        return False
        
    def get_total_active_trades(self):
        """Cuenta el total de operaciones (posiciones + órdenes) en TODA la cuenta"""
        if not MT5_AVAILABLE:
            return len(self.active_trades)
            
        total = 0
        positions = mt5.positions_get()
        if positions is not None:
            total += len(positions)
            
        orders = mt5.orders_get()
        if orders is not None:
            total += len(orders)
            
        return total
        
    def is_trading_allowed(self, symbol):
        """Verifica si el horario actual del servidor permite operar (Filtro diario y fin de semana)"""
        if not MT5_AVAILABLE:
            return True
            
        # IMPORTANTE: Seleccionar el símbolo primero, sino tick retorna None si no está en el Market Watch
        mt5.symbol_select(symbol, True)
        tick = mt5.symbol_info_tick(symbol)
        
        if not tick:
            return False
            
        # Bypass de horarios para Criptomonedas (Exness Cripto corre 24/7)
        if symbol.startswith(("BTC", "ETH")):
            return True
            
        server_time = datetime.fromtimestamp(tick.time)
        
        # Filtro Diario: No operar entre las 23:00 y las 01:00
        if server_time.hour == 23 or server_time.hour == 0:
            return False
            
        # Filtro Fin de Semana: No operar desde Viernes 20:00 hasta Domingo
        if server_time.weekday() == 4 and server_time.hour >= 20: # Viernes
            return False
        if server_time.weekday() in (5, 6): # Sábado y Domingo
            return False
            
        return True
        
    async def manage_open_positions(self):
        """Vigila las posiciones activas y mueve el SL a Break-Even si alcanzan +1R"""
        if not MT5_AVAILABLE:
            return
            
        positions = mt5.positions_get()
        if positions is None or len(positions) == 0:
            return
            
        for pos in positions:
            if pos.magic != 777777:
                continue
                
            symbol = pos.symbol
            open_price = pos.price_open
            current_price = pos.price_current
            sl = pos.sl
            tp = pos.tp
            pos_type = pos.type
            
            if sl == 0.0 or tp == 0.0:
                continue
                
            # Distancia 1R es la mitad de la distancia al TP (ya que TP es 2R)
            dist_1r = abs(tp - open_price) / 2.0
            
            symbol_info = mt5.symbol_info(symbol)
            if not symbol_info:
                continue
                
            tick_size = symbol_info.trade_tick_size
            
            # Compras (BUY)
            if pos_type == mt5.ORDER_TYPE_BUY:
                # Si el precio llegó a la mitad del camino (+1R)
                if current_price >= (open_price + dist_1r):
                    # Añadimos 2 ticks a favor para cubrir comisiones
                    be_price = open_price + (tick_size * 2)
                    if sl < be_price:
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": pos.ticket,
                            "symbol": symbol,
                            "sl": float(be_price),
                            "tp": float(tp),
                            "magic": 777777
                        }
                        result = mt5.order_send(request)
                        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                            logger.info(f"[{symbol}] 🛡️ Stop Loss movido a Break-Even ({be_price})")
                            await notifier.send_message(f"🛡️ <b>Free Ride Activado ({symbol})</b>\n\nLa compra alcanzó +1R.\nEl Stop Loss está ahora en {be_price:.4f} (Cero Riesgo).")
                        else:
                            logger.error(f"[{symbol}] Error moviendo SL a Break-Even: {result.comment if result else 'Desconocido'}")
                            
            # Ventas (SELL)
            elif pos_type == mt5.ORDER_TYPE_SELL:
                # Si el precio llegó a la mitad del camino (+1R)
                if current_price <= (open_price - dist_1r):
                    # Restamos 2 ticks a favor para cubrir comisiones
                    be_price = open_price - (tick_size * 2)
                    if sl > be_price:
                        request = {
                            "action": mt5.TRADE_ACTION_SLTP,
                            "position": pos.ticket,
                            "symbol": symbol,
                            "sl": float(be_price),
                            "tp": float(tp),
                            "magic": 777777
                        }
                        result = mt5.order_send(request)
                        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                            logger.info(f"[{symbol}] 🛡️ Stop Loss movido a Break-Even ({be_price})")
                            await notifier.send_message(f"🛡️ <b>Free Ride Activado ({symbol})</b>\n\nLa venta alcanzó +1R.\nEl Stop Loss está ahora en {be_price:.4f} (Cero Riesgo).")
                        else:
                            logger.error(f"[{symbol}] Error moviendo SL a Break-Even: {result.comment if result else 'Desconocido'}")

    async def monitor_closed_positions(self):
        """Detecta operaciones que se cerraron, calcula PnL/ROI y notifica"""
        if not MT5_AVAILABLE:
            return
            
        positions = mt5.positions_get()
        current_tickets = []
        if positions:
            for p in positions:
                if p.magic == 777777:
                    current_tickets.append(p.ticket)
                    # Registrar nueva posición si no estaba rastreada
                    if p.ticket not in self.tracked_positions:
                        self.tracked_positions[p.ticket] = {
                            'symbol': p.symbol,
                            'open_price': p.price_open,
                            'volume': p.volume
                        }
                        
                        # NOTIFICAR ENTRADA A MERCADO
                        direction_str = "COMPRA" if p.type == mt5.POSITION_TYPE_BUY else "VENTA"
                        msg = (f"🚀 <b>¡Orden Ejecutada a Mercado! ({p.symbol})</b>\n\n"
                               f"📈 <b>Dirección:</b> {direction_str}\n"
                               f"💲 <b>Precio de Entrada:</b> {p.price_open:.5f}\n"
                               f"📦 <b>Lotaje:</b> {p.volume:.2f}")
                        asyncio.create_task(notifier.send_message(msg))
                        
                        
        # Revisar cuáles posiciones rastreadas ya no están activas
        closed_tickets = []
        for ticket, data in self.tracked_positions.items():
            if ticket not in current_tickets:
                closed_tickets.append(ticket)
                
        for ticket in closed_tickets:
            # Obtener el historial de "deals" (transacciones reales) para este ticket
            deals = mt5.history_deals_get(position=ticket)
            if deals:
                # Sumar profit, swap y comisiones de todas las transacciones de esta posición
                total_profit = sum([d.profit + d.swap + d.commission for d in deals])
                symbol = self.tracked_positions[ticket]['symbol']
                
                # Obtener balance actual para ROI
                account_info = mt5.account_info()
                balance = account_info.balance if account_info else 0
                roi_pct = (total_profit / balance) * 100 if balance > 0 else 0
                
                # Extraer datos de la base de datos
                entry_deal = deals[0]
                exit_deal = deals[-1]
                direction = "Buy" if entry_deal.type == mt5.DEAL_TYPE_BUY else "Sell"
                open_price = self.tracked_positions[ticket]['open_price']
                lot_size = self.tracked_positions[ticket]['volume']
                close_price = exit_deal.price
                open_time = datetime.fromtimestamp(entry_deal.time).isoformat()
                close_time = datetime.fromtimestamp(exit_deal.time).isoformat()
                
                # Guardar en SQLite
                log_trade(symbol, direction, open_time, close_time, open_price, close_price, lot_size, total_profit, roi_pct)
                
                # Clasificar resultado (dejamos un margen de 5 centavos para Break-Even)
                if total_profit > 0.05:
                    emoji = "✅"
                    outcome = "Ganancia (Take Profit)"
                elif total_profit < -0.05:
                    emoji = "❌"
                    outcome = "Pérdida (Stop Loss)"
                else:
                    emoji = "🛡️"
                    outcome = "Break-Even (Cero Riesgo)"
                    
                # Formatear PnL y Balance según tipo de cuenta
                if self.account_type == "CENT":
                    pnl_display = f"{total_profit:.2f} USC (${total_profit / 100:.2f} USD)"
                    balance_display = f"{balance:.2f} USC (${balance / 100:.2f} USD)"
                else:
                    pnl_display = f"${total_profit:.2f} USD"
                    balance_display = f"${balance:.2f} USD"
                    
                msg = (f"{emoji} <b>Operación Cerrada ({symbol})</b>\n\n"
                       f"📊 <b>Resultado:</b> {outcome}\n"
                       f"💰 <b>PnL Neto:</b> {pnl_display}\n"
                       f"📈 <b>ROI:</b> {roi_pct:.2f}%\n\n"
                       f"💼 <b>Balance Restante:</b> {balance_display}")
                       
                await notifier.send_message(msg)
                
            # Eliminar del rastreador
            del self.tracked_positions[ticket]

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
            '1h': mt5.TIMEFRAME_H1,
            '4h': mt5.TIMEFRAME_H4,
            '1d': mt5.TIMEFRAME_D1
        }
        
        # Activar el símbolo en Observación del Mercado
        if not mt5.symbol_select(symbol, True):
            logger.error(f"Símbolo '{symbol}' no existe o está oculto. ¿Tal vez lleva un sufijo como 'm' (EURUSDm)?")
            return None
            
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
        Pantalla 1: Marea Macro (Diario 1D)
        Utilizamos la EMA de 13 períodos para la dirección de la tendencia.
        Filtro ADX: Requerimos ADX > 25 para garantizar que NO es un mercado lateral.
        """
        df['ema_13'] = ta.ema(df['close'], length=13)
        
        # Calcular ADX (14 periodos por defecto)
        adx_df = ta.adx(df['high'], df['low'], df['close'], length=14)
        if adx_df is not None and not adx_df.empty:
            df['adx'] = adx_df['ADX_14']
        else:
            df['adx'] = None
            
        if len(df) < 2:
            return 'NEUTRAL'
            
        last_row = df.iloc[-1]
        prev_row = df.iloc[-2]
        
        # Validación de datos insuficientes
        if pd.isna(last_row.get('ema_13')) or pd.isna(prev_row.get('ema_13')) or pd.isna(last_row.get('adx')):
            return 'NEUTRAL'
            
        # Filtro de Mercado Lateral (Rango)
        if last_row['adx'] < 25.0:
            return 'NEUTRAL'
        
        # Pendiente de la EMA 13
        if last_row['ema_13'] > prev_row['ema_13']:
            return 'BULLISH'
        elif last_row['ema_13'] < prev_row['ema_13']:
            return 'BEARISH'
            
        return 'NEUTRAL'

    def analyze_screen_2(self, df, trend_screen_1):
        """
        Pantalla 2: La Ola (4 Horas)
        Usa el Force Index (EMA 2) para identificar retrocesos contra la marea.
        """
        # Calcular Force Index = Volume * (Close - Close_previous)
        df['close_prev'] = df['close'].shift(1)
        df['force_index_raw'] = df['tick_volume'] * (df['close'] - df['close_prev'])
        
        # Suavizar con EMA de 2 períodos (La fórmula de Elder)
        df['force_index'] = ta.ema(df['force_index_raw'], length=2)
        
        last_fi = df.iloc[-1].get('force_index')
        
        # Validación de datos insuficientes
        if pd.isna(last_fi):
            return False
        
        # Si la marea es alcista, buscamos que el Force Index caiga por debajo de 0 (Retroceso)
        if trend_screen_1 == 'BULLISH' and last_fi < 0:
            return True # Señal de entrada válida (Comprar barato)
            
        # Si la marea es bajista, buscamos que el Force Index suba por encima de 0 (Rebote)
        if trend_screen_1 == 'BEARISH' and last_fi > 0:
            return True # Señal de entrada válida (Vender caro)
            
        return False

    def analyze_screen_3(self, symbol, df, trend_screen_1):
        """
        Pantalla 3: El Disparo (1 Hora)
        Estrategia Original de Alexander Elder: 
        - Compra: 1 tick por encima del máximo de la vela señal. SL 1 tick por debajo del mínimo.
        - Venta: 1 tick por debajo del mínimo de la vela señal. SL 1 tick por encima del máximo.
        (Se elimina el ATR ya que en temporalidad de 1H el tamaño de la vela es suficiente).
        """
        last_candle = df.iloc[-1]
        
        # Obtener el tamaño de 1 tick real del broker
        tick_size = 0.0001
        if MT5_AVAILABLE:
            symbol_info = mt5.symbol_info(symbol)
            if symbol_info:
                # tick_size o point, usaremos trade_tick_size que es el paso mínimo de precio
                tick_size = symbol_info.trade_tick_size
                if tick_size == 0:
                    tick_size = symbol_info.point
                    
        # Usamos 2 ticks de "respiro" para asegurar la ruptura
        buffer = tick_size * 2
        
        if trend_screen_1 == 'BULLISH':
            entry_price = last_candle['high'] + buffer
            stop_loss = last_candle['low'] - buffer
            return {'side': 'buy_stop', 'entry': entry_price, 'sl': stop_loss}
            
        elif trend_screen_1 == 'BEARISH':
            entry_price = last_candle['low'] - buffer
            stop_loss = last_candle['high'] + buffer
            return {'side': 'sell_stop', 'entry': entry_price, 'sl': stop_loss}
            
        return None

    def calculate_lot_size(self, symbol, entry_price, stop_loss_price):
        """Calcula el tamaño del lote basado en un riesgo fijo del 1% del balance"""
        if not MT5_AVAILABLE:
            return 0.01 # Lote mock para Mac
            
        account_info = mt5.account_info()
        symbol_info = mt5.symbol_info(symbol)
        
        if not account_info or not symbol_info:
            return 0.01
            
        balance = account_info.balance
        risk_amount = balance * (self.risk_percent / 100.0)
        logger.info(f"[{symbol}] Balance: {balance:.2f} -> Riesgo (1%): {risk_amount:.2f}")
        
        # Distancia en ticks
        tick_size = symbol_info.trade_tick_size
        tick_value = symbol_info.trade_tick_value
        
        distance_ticks = abs(entry_price - stop_loss_price) / tick_size
        
        if distance_ticks == 0:
            return symbol_info.volume_min
            
        risk_per_lot = distance_ticks * tick_value
        
        if risk_per_lot == 0:
            return symbol_info.volume_min
            
        # ESCUDO DE CAPITAL: Rechazar operación si el lote mínimo arriesga más del 1.5% del balance
        max_allowed_risk = risk_amount * 1.5
        if (symbol_info.volume_min * risk_per_lot) > max_allowed_risk:
            logger.warning(f"[{symbol}] ESCUDO DE CAPITAL: El lote mínimo ({symbol_info.volume_min}) arriesga {symbol_info.volume_min * risk_per_lot:.2f} (Límite 1.5x: {max_allowed_risk:.2f}). Abortando trade.")
            return 0.0
            
        # Calcular lote
        lot_size = risk_amount / risk_per_lot
        
        # Normalizar a los pasos permitidos por el broker (ej. 0.01)
        step = symbol_info.volume_step
        lot_size = math.floor(lot_size / step) * step
        
        # Respetar mínimos y máximos, y añadir un TOPE ABSOLUTO DE SEGURIDAD (MAX_LOTS)
        MAX_LOTS = 3.0
        max_allowed = min(symbol_info.volume_max, MAX_LOTS)
        lot_size = max(symbol_info.volume_min, min(lot_size, max_allowed))
        
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
        
        if lot_size <= 0.0:
            return None # Trade abortado por el Escudo de Capital
            
        logger.info(f"[{symbol}] Calculado Lote: {lot_size} | Entry: {entry} | SL: {sl} | TP: {tp}")
        
        if not MT5_AVAILABLE:
            logger.warning(f"Simulando ejecución en Mac: {side.upper()} {lot_size} lotes de {symbol}")
            self.active_trades[symbol] = True # Guardar estado simulado
            return {'status': 'simulated', 'lot': lot_size, 'tp': tp}
            
        # Calcular tiempo de expiración (1 hora = 3600 segundos) usando la hora del servidor
        expiration = 0
        tick = mt5.symbol_info_tick(symbol)
        if tick:
            expiration = int(tick.time) + 3600
            
        # Obtener decimales requeridos por el símbolo
        symbol_info = mt5.symbol_info(symbol)
        digits = symbol_info.digits if symbol_info else 5
            
        request = {
            "action": mt5.TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": float(lot_size),
            "type": order_type,
            "price": round(float(entry), digits),
            "sl": round(float(sl), digits),
            "tp": round(float(tp), digits),
            "deviation": 20,
            "magic": 777777,
            "comment": "TripleScreen",
            "type_time": mt5.ORDER_TIME_SPECIFIED,
            "expiration": expiration,
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
            
        # Bucle de análisis (se ejecutaría cada 1 Hora en producción)
        while True:
            # 0. GESTIÓN DE BREAK-EVEN Y PnL TRACKER
            await self.manage_open_positions()
            await self.monitor_closed_positions()
            
            # FILTRO GLOBAL: Máximo 3 operaciones
            if self.get_total_active_trades() >= 3:
                logger.info("Límite global de 3 operaciones alcanzado. Pausando escaneo...")
                await asyncio.sleep(900)
                continue
                
            for symbol in self.symbols:
                logger.info(f"Analizando {symbol}...")
                
                # VERIFICACIÓN DE ESTADO PREVIO
                if self.has_active_trade(symbol):
                    logger.info(f"[{symbol}] Operación o orden activa encontrada. Saltando análisis para evitar duplicados.")
                    continue
                    
                # CUARENTENA DE 12 HORAS
                last_close = get_last_close_time(symbol)
                if last_close:
                    hours_elapsed = (datetime.now() - last_close).total_seconds() / 3600
                    if hours_elapsed < 12:
                        logger.info(f"[{symbol}] En Cuarentena. Faltan {12 - hours_elapsed:.1f}h para volver a operar.")
                        continue
                        
                # FILTRO DE TIEMPO
                if not self.is_trading_allowed(symbol):
                    logger.info(f"[{symbol}] Fuera del horario de trading permitido. Saltando.")
                    continue
                
                # 1. Analizar Marea (Diario)
                df_1d = self.fetch_data(symbol, '1d')
                if df_1d is None: continue
                trend = self.analyze_screen_1(df_1d)
                
                if trend == 'NEUTRAL':
                    logger.info(f"[{symbol}] Marea neutral. Ignorando.")
                    continue
                    
                logger.info(f"[{symbol}] Pantalla 1 (1D) - Tendencia: {trend}")
                
                # 2. Analizar Ola (4H)
                df_4h = self.fetch_data(symbol, '4h')
                if df_4h is None: continue
                wave_signal = self.analyze_screen_2(df_4h, trend)
                
                if not wave_signal:
                    logger.info(f"[{symbol}] Pantalla 2 (4H) - Sin retroceso (Force Index no alineado).")
                    continue
                    
                logger.info(f"[{symbol}] Pantalla 2 (4H) - Retroceso detectado. Preparando disparo...")
                
                # 3. Analizar Disparo (1H)
                df_1h = self.fetch_data(symbol, '1h')
                if df_1h is None: continue
                trade_setup = self.analyze_screen_3(symbol, df_1h, trend)
                
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
                               f"🧭 <b>Marea (1D):</b> {trend}\n"
                               f"🌊 <b>Ola (4H):</b> Retroceso Confirmado (Force Index)\n"
                               f"🔫 <b>Disparo (1H):</b> {trade_setup['side'].upper()}\n\n"
                               f"💰 <b>Lotes:</b> {lot}\n"
                               f"📍 <b>Entrada (Stop Order):</b> {trade_setup['entry']}\n"
                               f"🛡️ <b>Stop Loss:</b> {trade_setup['sl']}\n"
                               f"🤑 <b>Take Profit (1:2):</b> {tp_price:.4f}\n\n"
                               f"⏱️ <i>Nota: La orden expirará automáticamente en 1 hora si no se activa.</i>")
                        await notifier.send_message(msg)
                    
            logger.info("Ciclo terminado. Durmiendo 15 minutos...")
            await asyncio.sleep(900) # 15 minutos

if __name__ == "__main__":
    bot = TradTripleScreenBot()
    asyncio.run(bot.run())
