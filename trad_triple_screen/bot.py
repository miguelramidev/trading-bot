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
            f"AUDUSD{suffix}", f"GBPJPY{suffix}", f"BTCUSD{suffix}", f"ETHUSD{suffix}",
            f"EURGBP{suffix}", f"EURJPY{suffix}", f"AUDJPY{suffix}", f"USDCHF{suffix}",
            f"XAGUSD{suffix}", f"XTIUSD{suffix}", f"DE30{suffix}", f"XRPUSD{suffix}", f"SOLUSD{suffix}"
        ] 
        self.correlation_groups = {
            "METALS": [f"XAUUSD{suffix}", f"XAGUSD{suffix}"],
            "CRYPTO": [f"BTCUSD{suffix}", f"ETHUSD{suffix}", f"XRPUSD{suffix}", f"SOLUSD{suffix}"],
            "INDICES_US": [f"US30{suffix}", f"US500{suffix}", f"USTEC{suffix}"],
            "JPY_PAIRS": [f"USDJPY{suffix}", f"GBPJPY{suffix}", f"EURJPY{suffix}", f"AUDJPY{suffix}"],
            "USD_MAJORS": [f"EURUSD{suffix}", f"GBPUSD{suffix}", f"AUDUSD{suffix}", f"USDCAD{suffix}", f"USDCHF{suffix}"] 
        }
        self.risk_percent = 1.0 # Riesgo fijo institucional del 1%
        self.active_trades = {} # Para simulación de estado en Mac
        self.tracked_positions = {} # Para rastrear PnL y ROI de operaciones abiertas
        
        # Inicializar Base de Datos
        init_db()
        
    def is_group_active(self, symbol):
        """Verifica si ya hay una operación abierta en el mismo grupo correlacionado (Anti-Correlación)"""
        for group_name, symbols_in_group in self.correlation_groups.items():
            if symbol in symbols_in_group:
                # El símbolo pertenece a este grupo. Revisemos si algún otro símbolo del grupo está activo
                for other_symbol in symbols_in_group:
                    if other_symbol != symbol and self.has_active_trade(other_symbol):
                        logger.info(f"[{symbol}] Filtro Anti-Correlación: Saltando porque {other_symbol} ({group_name}) ya está activo.")
                        return True
        return False

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
            
        from datetime import timezone
        
        # Usar siempre la hora UTC real para no depender del reloj de la computadora local (Paraguay)
        server_time = datetime.now(timezone.utc)
        
        # Filtro Diario (Rollover de Nueva York / Sidney): 
        # Cierre NY es a las 17:00 EST, que equivale a las 21:00 o 22:00 UTC dependiendo del horario de verano.
        # Bloqueamos de 21:00 a 22:59 UTC para evitar los spreads altísimos de esa ventana.
        if server_time.hour == 21 or server_time.hour == 22:
            return False
            
        # Filtro Fin de Semana: El mercado de divisas cierra el viernes a las 21:00 UTC
        # y abre el domingo a las 21:00 UTC. Bloqueamos operar en ese lapso.
        if server_time.weekday() == 4 and server_time.hour >= 21: # Viernes después del cierre NY
            return False
        if server_time.weekday() == 5: # Sábado entero cerrado
            return False
        if server_time.weekday() == 6 and server_time.hour < 21: # Domingo antes de apertura Sidney
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
                
            comment = pos.comment
            
            # Calcular 1R basado en el multiplicador del TP original
            if comment == "TS_Half_B":
                dist_1r = abs(tp - open_price) / 3.0
            elif comment == "[MR]":
                dist_1r = abs(tp - open_price) / 1.5
            else: # TS_Half_A, TS_Full, TripleScreen
                dist_1r = abs(tp - open_price) / 2.0
                
            symbol_info = mt5.symbol_info(symbol)
            if not symbol_info:
                continue
                
            tick_size = symbol_info.trade_tick_size
            
            # Compras (BUY)
            if pos_type == mt5.ORDER_TYPE_BUY:
                new_sl = sl
                # Fase 2: Precio alcanza +2R -> Mover SL a +1R
                if current_price >= (open_price + (dist_1r * 2.0)):
                    target_sl = open_price + dist_1r
                    if sl < target_sl:
                        new_sl = target_sl
                # Fase 1: Precio alcanza +1R -> Mover SL a BE
                elif current_price >= (open_price + dist_1r):
                    target_sl = open_price + (tick_size * 2)
                    if sl < target_sl:
                        new_sl = target_sl
                        
                if new_sl != sl:
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP, "position": pos.ticket, "symbol": symbol,
                        "sl": float(new_sl), "tp": float(tp), "magic": 777777
                    }
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"[{symbol}] 🛡️ SL movido a {new_sl} (Trailing Dinámico)")
                        msg = f"🛡️ <b>SL Actualizado ({symbol})</b>\n\nEl mercado avanzó. Nuevo SL: {new_sl:.4f}."
                        if new_sl == open_price + (tick_size * 2):
                            msg += "\n(Riesgo Cero - Break Even)"
                        else:
                            msg += "\n(Ganancia Asegurada de +1R)"
                        await notifier.send_message(msg)
                            
            # Ventas (SELL)
            elif pos_type == mt5.ORDER_TYPE_SELL:
                new_sl = sl
                # Fase 2: Precio alcanza +2R -> Mover SL a +1R
                if current_price <= (open_price - (dist_1r * 2.0)):
                    target_sl = open_price - dist_1r
                    if sl > target_sl:
                        new_sl = target_sl
                # Fase 1: Precio alcanza +1R -> Mover SL a BE
                elif current_price <= (open_price - dist_1r):
                    target_sl = open_price - (tick_size * 2)
                    if sl > target_sl:
                        new_sl = target_sl
                        
                if new_sl != sl:
                    request = {
                        "action": mt5.TRADE_ACTION_SLTP, "position": pos.ticket, "symbol": symbol,
                        "sl": float(new_sl), "tp": float(tp), "magic": 777777
                    }
                    result = mt5.order_send(request)
                    if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                        logger.info(f"[{symbol}] 🛡️ SL movido a {new_sl} (Trailing Dinámico)")
                        msg = f"🛡️ <b>SL Actualizado ({symbol})</b>\n\nEl mercado avanzó. Nuevo SL: {new_sl:.4f}."
                        if new_sl == open_price - (tick_size * 2):
                            msg += "\n(Riesgo Cero - Break Even)"
                        else:
                            msg += "\n(Ganancia Asegurada de +1R)"
                        await notifier.send_message(msg)

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
                # Para evitar conflictos de huso horario, usamos UTC absoluto.
                # Aseguramos que se guarde con el offset +00:00.
                from datetime import timezone
                open_time = datetime.now(timezone.utc).isoformat() # Fallback temporal seguro
                close_time = datetime.now(timezone.utc).isoformat()
                
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

    def fetch_data(self, symbol, timeframe, num_candles=300):
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
        Utilizamos el Filtro de Oro Institucional (EMA 50 y EMA 200) para la dirección de la tendencia.
        Filtro ADX: Requerimos ADX > 25 para garantizar que NO es un mercado lateral.
        """
        df['ema_50'] = ta.ema(df['close'], length=50)
        df['ema_200'] = ta.ema(df['close'], length=200)
        
        # Calcular ADX (14 periodos por defecto)
        adx_df = ta.adx(df['high'], df['low'], df['close'], length=14)
        if adx_df is not None and not adx_df.empty:
            df['adx'] = adx_df['ADX_14']
        else:
            df['adx'] = None
            
        if len(df) < 200:
            return ('NONE', 'NEUTRAL')
            
        last_row = df.iloc[-1]
        
        # Validación de datos insuficientes
        if pd.isna(last_row.get('ema_200')) or pd.isna(last_row.get('ema_50')) or pd.isna(last_row.get('adx')):
            return ('NONE', 'NEUTRAL')
            
        # Filtro de Mercado Lateral (Rango)
        regime = 'RANGING' if last_row['adx'] < 25.0 else 'TRENDING'
        
        # Filtro Institucional de Tendencia (Golden Cross / Death Cross dinámico)
        if regime == 'TRENDING':
            close_price = last_row['close']
            ema50 = last_row['ema_50']
            ema200 = last_row['ema_200']
            
            if close_price > ema50 and ema50 > ema200:
                return ('BULLISH', regime)
            elif close_price < ema50 and ema50 < ema200:
                return ('BEARISH', regime)
            
        return ('NONE', regime)

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
        Usamos el ATR(14) en la gráfica de 1H para crear un SL Dinámico y seguro.
        """
        last_candle = df.iloc[-1]
        
        # Calcular ATR(14) de 1 Hora
        df['atr'] = ta.atr(df['high'], df['low'], df['close'], length=14)
        atr_value = df['atr'].iloc[-1] if not pd.isna(df['atr'].iloc[-1]) else 0.0
        
        # Si por alguna razón falla el ATR, usamos un fallback basado en % de precio
        if atr_value <= 0:
            atr_value = last_candle['close'] * 0.002
            
        # Obtener el spread
        spread = 0.0
        if MT5_AVAILABLE:
            tick = mt5.symbol_info_tick(symbol)
            if tick:
                spread = tick.ask - tick.bid
                logger.info(f"[{symbol}] ATR(14) 1H: {atr_value:.5f} | Spread: {spread:.5f}")
                    
        # Colchón institucional de volatilidad
        buffer = (atr_value * 2.0)
        
        if trend_screen_1 == 'BULLISH':
            # Entrada agresiva al romper el máximo de la hora pasada
            entry_price = last_candle['high'] + spread
            stop_loss = entry_price - buffer
            return {'side': 'buy_stop', 'entry': entry_price, 'sl': stop_loss}
            
        elif trend_screen_1 == 'BEARISH':
            entry_price = last_candle['low'] - spread
            stop_loss = entry_price + buffer
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
            
        # Parche generalizado para errores del broker (Exness Cent reporta mal el volumen mínimo de algunas criptos)
        # Aquí podemos añadir más símbolos si descubrimos que el broker miente en su API
        BROKER_MIN_VOLUME_OVERRIDES = {
            "ETHUSDc": 10.0,
            # "LTCUSDc": 1.0, # Ejemplo de cómo agregar más en el futuro
        }
        true_min_volume = BROKER_MIN_VOLUME_OVERRIDES.get(symbol, symbol_info.volume_min)
            
        # ESCUDO DE CAPITAL: Rechazar operación si el lote mínimo real arriesga más del 1.5% del balance
        max_allowed_risk = risk_amount * 1.5
        if (true_min_volume * risk_per_lot) > max_allowed_risk:
            logger.warning(f"[{symbol}] ESCUDO DE CAPITAL: El lote mínimo real ({true_min_volume}) arriesga {true_min_volume * risk_per_lot:.2f} (Límite 1.5x: {max_allowed_risk:.2f}). Abortando trade.")
            return 0.0
            
        # Calcular lote
        lot_size = risk_amount / risk_per_lot
        
        # Normalizar a los pasos permitidos por el broker (ej. 0.01)
        step = symbol_info.volume_step
        lot_size = math.floor(lot_size / step) * step
        
        # Respetar mínimos y máximos del broker (usando nuestro true_min_volume)
        lot_size = max(true_min_volume, min(lot_size, symbol_info.volume_max))
        
        # Redondeo final para evitar errores de precisión flotante de Python en MT5
        decimals = abs(int(math.floor(math.log10(step)))) if step < 1 else 0
        lot_size = round(lot_size, decimals)
        
        return lot_size

    def normalize_price(self, symbol, price):
        """Normaliza un precio al tick_size y digits exactos del broker para evitar 'Invalid price'"""
        if not MT5_AVAILABLE:
            return round(float(price), 5)
        info = mt5.symbol_info(symbol)
        if not info: return price
        tick_size = info.trade_tick_size
        digits = info.digits
        if tick_size > 0:
            price = round(price / tick_size) * tick_size
        return round(float(price), digits)

    async def execute_trade(self, symbol, trade_setup, trend):
        """Envía las órdenes pendientes (Split) a MT5"""
        side = trade_setup['side']
        entry = trade_setup['entry']
        sl = trade_setup['sl']
        
        distance = abs(entry - sl)
        if side == 'buy_stop':
            tp_1 = entry + (distance * 2) # TP 1:2
            tp_2 = entry + (distance * 3) # TP 1:3
            order_type = mt5.ORDER_TYPE_BUY_STOP
        else:
            tp_1 = entry - (distance * 2) # TP 1:2
            tp_2 = entry - (distance * 3) # TP 1:3
            order_type = mt5.ORDER_TYPE_SELL_STOP
            
        total_lot_size = self.calculate_lot_size(symbol, entry, sl)
        
        if total_lot_size <= 0.0:
            return None # Trade abortado por el Escudo de Capital
            
        logger.info(f"[{symbol}] Calculado Lote Total: {total_lot_size} | Entry: {entry:.5f} | SL: {sl:.5f}")
        
        if not MT5_AVAILABLE:
            logger.warning(f"Simulando ejecución en Mac: {side.upper()} {total_lot_size} lotes de {symbol}")
            self.active_trades[symbol] = True # Guardar estado simulado
            return {'status': 'simulated', 'lot': total_lot_size, 'tp': tp_1}
            
        symbol_info = mt5.symbol_info(symbol)
        min_lot = symbol_info.volume_min if symbol_info else 0.01
        step_lot = symbol_info.volume_step if symbol_info else 0.01
        
        # Calcular tiempo de expiración (1 hora = 3600 segundos)
        expiration = 0
        tick = mt5.symbol_info_tick(symbol)
        if tick:
            expiration = int(tick.time) + 3600
            
        # Normalizar precios
        entry_norm = self.normalize_price(symbol, entry)
        sl_norm = self.normalize_price(symbol, sl)
        tp_1_norm = self.normalize_price(symbol, tp_1)
        tp_2_norm = self.normalize_price(symbol, tp_2)
        
        # Validar distancia de seguridad para órdenes stop
        if tick:
            if order_type == mt5.ORDER_TYPE_BUY_STOP and entry_norm <= tick.ask:
                logger.warning(f"[{symbol}] Entry Buy Stop ({entry_norm}) <= Ask ({tick.ask}). Cancelando.")
                return None
            if order_type == mt5.ORDER_TYPE_SELL_STOP and entry_norm >= tick.bid:
                logger.warning(f"[{symbol}] Entry Sell Stop ({entry_norm}) >= Bid ({tick.bid}). Cancelando.")
                return None
                
        # SPLIT ORDERS LOGIC (Escalado de Ganancias)
        # Si podemos dividir el lote sin bajar del mínimo
        half_lot = round((total_lot_size / 2.0) / step_lot) * step_lot
        
        requests = []
        if half_lot >= min_lot:
            lot_a = half_lot
            lot_b = round((total_lot_size - lot_a) / step_lot) * step_lot
            logger.info(f"[{symbol}] Dividiendo orden: Lote A (TP 1:2) = {lot_a}, Lote B (TP 1:3) = {lot_b}")
            
            # Orden A
            req_a = {
                "action": mt5.TRADE_ACTION_PENDING, "symbol": symbol, "volume": float(lot_a),
                "type": order_type, "price": entry_norm, "sl": sl_norm, "tp": tp_1_norm,
                "deviation": 20, "magic": 777777, "comment": "TS_Half_A",
                "type_time": mt5.ORDER_TIME_SPECIFIED, "expiration": expiration, "type_filling": mt5.ORDER_FILLING_IOC,
            }
            # Orden B
            req_b = {
                "action": mt5.TRADE_ACTION_PENDING, "symbol": symbol, "volume": float(lot_b),
                "type": order_type, "price": entry_norm, "sl": sl_norm, "tp": tp_2_norm,
                "deviation": 20, "magic": 777777, "comment": "TS_Half_B",
                "type_time": mt5.ORDER_TIME_SPECIFIED, "expiration": expiration, "type_filling": mt5.ORDER_FILLING_IOC,
            }
            requests.extend([req_a, req_b])
        else:
            logger.info(f"[{symbol}] Lote {total_lot_size} demasiado pequeño para dividir. Enviando orden única con TP 1:2.")
            req_single = {
                "action": mt5.TRADE_ACTION_PENDING, "symbol": symbol, "volume": float(total_lot_size),
                "type": order_type, "price": entry_norm, "sl": sl_norm, "tp": tp_1_norm,
                "deviation": 20, "magic": 777777, "comment": "TS_Full",
                "type_time": mt5.ORDER_TIME_SPECIFIED, "expiration": expiration, "type_filling": mt5.ORDER_FILLING_IOC,
            }
            requests.append(req_single)
            
        success_count = 0
        for req in requests:
            result = mt5.order_send(req)
            if result and result.retcode == mt5.TRADE_RETCODE_DONE:
                success_count += 1
            else:
                logger.error(f"[{symbol}] Falló envío de orden: {result.comment if result else 'None'}")
                
        if success_count > 0:
            return {'status': 'executed', 'lot': total_lot_size, 'tp': tp_1}
        return None

    async def execute_market_order(self, symbol, direction, sl, tp, lot_size, strategy_name="[MR]"):
        """Envía una orden de mercado para Mean Reversion (Rango)"""
        order_type = mt5.ORDER_TYPE_BUY if direction == 'BULLISH' else mt5.ORDER_TYPE_SELL
        
        logger.info(f"{strategy_name} [{symbol}] Ejecutando a Mercado | Lote: {lot_size} | SL: {sl} | TP: {tp}")
        
        if not MT5_AVAILABLE:
            logger.warning(f"Simulando ejecución a mercado en Mac: {direction} {lot_size} lotes de {symbol}")
            self.active_trades[symbol] = True
            return {'status': 'simulated', 'lot': lot_size, 'tp': tp}
            
        symbol_info = mt5.symbol_info(symbol)
        digits = symbol_info.digits if symbol_info else 5
        
        tick = mt5.symbol_info_tick(symbol)
        price = tick.ask if direction == 'BULLISH' else tick.bid
            
        entry_norm = self.normalize_price(symbol, price)
        sl_norm = self.normalize_price(symbol, sl)
        tp_norm = self.normalize_price(symbol, tp)
            
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": float(lot_size),
            "type": order_type,
            "price": entry_norm,
            "sl": sl_norm,
            "tp": tp_norm,
            "deviation": 20,
            "magic": 777777,
            "comment": strategy_name,
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        
        result = mt5.order_send(request)
        if result and result.retcode == mt5.TRADE_RETCODE_DONE:
            logger.info(f"{strategy_name} [{symbol}] Orden a mercado ejecutada. Ticket: {result.order}")
            msg = (f"🚀 <b>¡{strategy_name} Entrada al Mercado! ({symbol})</b>\n\n"
                   f"📈 <b>Dirección:</b> {'COMPRA' if direction == 'BULLISH' else 'VENTA'}\n"
                   f"💲 <b>Precio:</b> {price:.5f}\n"
                   f"🛡️ <b>SL:</b> {sl:.5f}\n"
                   f"🎯 <b>TP:</b> {tp:.5f}\n"
                   f"📦 <b>Lotaje:</b> {lot_size}")
            await notifier.send_message(msg)
            return {'status': 'executed', 'lot': lot_size, 'tp': tp}
        else:
            logger.error(f"{strategy_name} [{symbol}] Fallo al ejecutar orden a mercado: {result.retcode}")
            return None

    async def analyze_mean_reversion(self, symbol):
        """Motor de Reversión a la Media usando Bandas de Bollinger en 1H"""
        df_1h = self.fetch_data(symbol, '1h')
        if df_1h is None or len(df_1h) < 20: 
            return
            
        # Calcular Bandas de Bollinger
        bb = ta.bbands(df_1h['close'], length=20, std=2)
        if bb is None or bb.empty: return
        
        df_1h = pd.concat([df_1h, bb], axis=1)
        
        # Última vela cerrada completa de 1H
        last_closed = df_1h.iloc[-2]
        
        if pd.isna(last_closed.get('BBL_20_2.0')): return
        
        close_price = last_closed['close']
        bb_lower = last_closed['BBL_20_2.0']
        bb_upper = last_closed['BBU_20_2.0']
        bb_middle = last_closed['BBM_20_2.0']
        
        direction = None
        if close_price < bb_lower:
            direction = 'BULLISH'
        elif close_price > bb_upper:
            direction = 'BEARISH'
            
        if not direction:
            return # Sin señal
            
        logger.info(f"[{symbol}] [MR] ¡Cierre de vela fuera de BB! Dirección: {direction}")
        
        # Calcular Riesgo usando ATR Diario para mantener la coherencia matemática del bot
        df_1d = self.fetch_data(symbol, '1d')
        if df_1d is None: return
        df_1d['atr'] = ta.atr(df_1d['high'], df_1d['low'], df_1d['close'], length=14)
        atr_value = df_1d['atr'].iloc[-1]
        
        tick = mt5.symbol_info_tick(symbol)
        if not tick: return
        
        spread = tick.ask - tick.bid
        logger.info(f"[{symbol}] [MR] Spread detectado para buffer de seguridad: {spread:.5f}")
        
        current_price = tick.ask if direction == 'BULLISH' else tick.bid
        
        if direction == 'BULLISH':
            sl = current_price - (atr_value * 1.5) - spread
            tp = bb_middle
            dist_sl = current_price - sl
            if tp <= current_price + (dist_sl * 1.0):
                tp = current_price + (dist_sl * 1.5)
        else:
            sl = current_price + (atr_value * 1.5) + spread
            tp = bb_middle
            dist_sl = sl - current_price
            if tp >= current_price - (dist_sl * 1.0):
                tp = current_price - (dist_sl * 1.5)
                
        # Usar el módulo seguro de Lotaje
        lot_size = self.calculate_lot_size(symbol, current_price, sl)
        if lot_size <= 0.0:
            return
            
        await self.execute_market_order(symbol, direction, sl, tp, lot_size)

    async def sleep_until_next_interval(self, minutes=15):
        """Duerme hasta el próximo intervalo exacto de reloj (ej. :00, :15, :30, :45)"""
        now = datetime.now()
        # Calcular los minutos del siguiente intervalo
        next_minute = ((now.minute // minutes) + 1) * minutes
        
        # Calcular el tiempo objetivo exacto (sumando los minutos, lo que manejará el salto de hora)
        target_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(minutes=next_minute)
        
        # Segundos a dormir
        sleep_seconds = (target_time - now).total_seconds()
        
        logger.info(f"Durmiendo {int(sleep_seconds)} segundos hasta la próxima vela ({target_time.strftime('%H:%M:%S')})...")
        await asyncio.sleep(sleep_seconds)

    async def position_management_loop(self):
        """Bucle secundario que se ejecuta frecuentemente para trailing stop y monitoreo rápido"""
        logger.info("Iniciando motor de monitoreo de posiciones (Fast Loop: 30s)...")
        while True:
            try:
                await self.manage_open_positions()
                await self.monitor_closed_positions()
            except Exception as e:
                logger.error(f"Error en bucle rápido de posiciones: {e}")
            await asyncio.sleep(30)

    async def run(self):
        """Bucle principal de análisis"""
        logger.info("Arrancando Bot Triple Pantalla...")
        if not self.connect():
            return
            
        # Arrancar el bucle rápido de posiciones en segundo plano (Concurrencia)
        asyncio.create_task(self.position_management_loop())
            
        # Bucle de análisis (se ejecuta cada 15m)
        while True:
            
            # FILTRO GLOBAL: Máximo 3 operaciones
            if self.get_total_active_trades() >= 3:
                logger.info("Límite global de 3 operaciones alcanzado. Pausando escaneo...")
                await self.sleep_until_next_interval(15)
                continue
                
            # -- PRE-ESCANEO Y ALPHA RANKING --
            eligible_symbols = []
            
            for symbol in self.symbols:
                # Filtros Rápidos
                if self.has_active_trade(symbol):
                    continue
                # Filtro Anti-Correlación de Grupo
                if self.is_group_active(symbol):
                    continue
                    
                if not self.is_trading_allowed(symbol):
                    continue
                    
                # Calcular Fuerza (ADX Diario)
                df_1d = self.fetch_data(symbol, '1d')
                if df_1d is None or len(df_1d) < 14:
                    continue
                    
                adx_df = ta.adx(df_1d['high'], df_1d['low'], df_1d['close'], length=14)
                if adx_df is not None and not adx_df.empty:
                    adx_val = adx_df['ADX_14'].iloc[-1]
                    if not pd.isna(adx_val):
                        eligible_symbols.append({'symbol': symbol, 'adx': adx_val})
            
            # Ordenar por ADX de Mayor a Menor (Los más fuertes primero)
            eligible_symbols.sort(key=lambda x: x['adx'], reverse=True)
            
            if not eligible_symbols:
                logger.info("Ningún símbolo disponible para operar (todos filtrados o en cuarentena).")
            else:
                ranked_list_str = ", ".join([f"{s['symbol']}({s['adx']:.1f})" for s in eligible_symbols])
                logger.info(f"🏆 Alpha Ranking (Disponibles): {ranked_list_str}")
                
            for item in eligible_symbols:
                # FILTRO GLOBAL ESTRICTO: Re-verificar límite en caso de haber abierto operaciones en este mismo bucle
                if self.get_total_active_trades() >= 3:
                    logger.info("Límite de 3 operaciones alcanzado durante la ejecución. Deteniendo escaneo actual.")
                    break
                    
                symbol = item['symbol']
                
                # FILTRO DE ANTI-CORRELACIÓN
                if self.is_group_active(symbol):
                    continue
                    
                logger.info(f"Analizando {symbol} (Fuerza ADX: {item['adx']:.1f})...")
                
                # 1. Analizar Marea (Diario)
                df_1d = self.fetch_data(symbol, '1d')
                if df_1d is None: continue
                trend, regime = self.analyze_screen_1(df_1d)
                
                # --- CUARENTENA SELECTIVA ---
                last_close = get_last_close_time(symbol)
                if last_close:
                    from datetime import timezone
                    # Si la base de datos guardó la fecha sin timezone (naive), asumimos UTC
                    if last_close.tzinfo is None:
                        last_close = last_close.replace(tzinfo=timezone.utc)
                        
                    hours_elapsed = (datetime.now(timezone.utc) - last_close).total_seconds() / 3600
                    # Si es Tendencia, aplicamos cuarentena de 6 horas
                    if hours_elapsed < 6 and regime == 'TRENDING':
                        logger.info(f"[{symbol}] En Cuarentena de Tendencia (faltan {6 - hours_elapsed:.1f}h). Ignorando.")
                        continue
                
                if regime == 'RANGING':
                    logger.info(f"[{symbol}] Régimen LATERAL (ADX < 25). Ejecutando Motor Mean Reversion...")
                    await self.analyze_mean_reversion(symbol)
                    continue
                    
                if trend == 'NONE':
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
                    
            logger.info("Ciclo terminado. Esperando a la siguiente vela de 15m...")
            await self.sleep_until_next_interval(15)

if __name__ == "__main__":
    bot = TradTripleScreenBot()
    asyncio.run(bot.run())
