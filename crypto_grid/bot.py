import asyncio
import ccxt.async_support as ccxt
import pandas as pd
import json
import logging
import websockets
import math
import os
import time
from shared.config import BINANCE_API_KEY, BINANCE_SECRET_KEY, BINANCE_TESTNET, MAX_LEVERAGE
from shared.notifier import notifier

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("CryptoGridBot")

class CryptoGridBot:
    def __init__(self):
        self.exchange = ccxt.binance({
            'apiKey': BINANCE_API_KEY,
            'secret': BINANCE_SECRET_KEY,
            'enableRateLimit': True,
            'options': {
                'defaultType': 'future', # Assuming futures for leverage
            }
        })
        if BINANCE_TESTNET:
            self.exchange.set_sandbox_mode(True)
            logger.info("Running in TESTNET mode.")
        else:
            logger.warning("Running in LIVE mode with REAL CAPITAL.")
            
        self.active_grids = {} # Keep track of grids
        self.state_file = 'data/state.json'

    def load_state(self):
        """Load grid state from disk to recover from crashes"""
        if os.path.exists(self.state_file):
            try:
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    logger.info(f"💾 Estado previo cargado exitosamente: {state['symbol']}")
                    return state
            except Exception as e:
                logger.error(f"Error cargando el estado: {e}")
        return None

    def save_state(self, symbol, trend, grid_levels, stop_loss, take_profit, leveraged_size):
        """Save the active grid state to disk"""
        state = {
            'symbol': symbol,
            'trend': trend,
            'grid_levels': grid_levels,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'leveraged_size': leveraged_size,
            'open_orders': [] # Aquí guardaremos los IDs reales de CCXT cuando se activen
        }
        try:
            with open(self.state_file, 'w') as f:
                json.dump(state, f, indent=4)
            logger.info("💾 Estado del Grid guardado en el disco (Persistencia activa).")
        except Exception as e:
            logger.error(f"Error guardando el estado: {e}")

    async def get_dynamic_trade_size(self):
        """Calculates 90% of the available USDT balance in the futures account"""
        try:
            balance = await self.exchange.fetch_balance(params={'type': 'future'})
            if 'USDT' in balance and 'free' in balance['USDT']:
                free_usdt = balance['USDT']['free']
                trade_size = free_usdt * 0.90
                logger.info(f"Available Balance: {free_usdt:.2f} USDT | Calculated Trade Size (90%): {trade_size:.2f} USDT")
                return trade_size
            else:
                logger.warning("USDT balance not found or empty.")
                return 0.0
        except Exception as e:
            logger.error(f"Error fetching balance: {e}")
            return 0.0

    async def fetch_top_volume_coins(self, limit=100):
        """Fetch the top coins by volume in the last 24h"""
        logger.info("Fetching top volume coins on Binance Futures...")
        try:
            await self.exchange.load_markets()
            tickers = await self.exchange.fetch_tickers()
            
            # Filter for USDT pairs and sort by quote volume
            usdt_pairs = []
            for symbol, ticker in tickers.items():
                if symbol.endswith(':USDT') or symbol.endswith('/USDT'): # Depending on ccxt format
                    # Extract quote volume
                    quote_vol = ticker.get('quoteVolume', 0)
                    if quote_vol is not None and quote_vol > 0:
                        usdt_pairs.append({
                            'symbol': symbol,
                            'volume': quote_vol
                        })
                        
            usdt_pairs = sorted(usdt_pairs, key=lambda x: x['volume'], reverse=True)
            top_coins = [pair['symbol'] for pair in usdt_pairs[:limit]]
            logger.info(f"Found top {len(top_coins)} coins by volume.")
            return top_coins
        except Exception as e:
            logger.error(f"Error fetching top coins: {e}")
            return []

    def calculate_atr(self, df: pd.DataFrame, period=14):
        """Calculate Average True Range (ATR) manually using Pandas"""
        high_low = df['high'] - df['low']
        high_close = (df['high'] - df['close'].shift()).abs()
        low_close = (df['low'] - df['close'].shift()).abs()
        
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = ranges.max(axis=1)
        atr = true_range.rolling(period).mean()
        return atr

    async def fetch_klines(self, symbol, timeframe='1h', limit=100):
        """Fetch historical klines (candlesticks) for a symbol"""
        try:
            ohlcv = await self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching klines for {symbol}: {e}")
            return None

    async def analyze_and_pick_best_coin(self, top_coins):
        """Analyze coins and return a ranked list based on grid trading conditions (ranging market)"""
        logger.info(f"Analyzing {len(top_coins)} coins for grid trading conditions...")
        scored_coins = []
        
        for symbol in top_coins[:20]: # Limit to top 20 to avoid rate limits
            df = await self.fetch_klines(symbol, timeframe='1h', limit=168) # 7 days of 1h candles
            if df is None or len(df) < 14:
                continue
                
            # Calculate ATR
            atr = self.calculate_atr(df, period=14)
            current_close = df['close'].iloc[-1]
            first_close = df['close'].iloc[0]
            
            # 1. Volatility measure: ATR as a percentage of current price
            current_atr = atr.iloc[-1]
            atr_pct = (current_atr / current_close) * 100
            
            # 2. Ranging measure: Absolute percentage change over the period
            price_change_pct = abs(current_close - first_close) / first_close * 100
            
            # We want high volatility (atr_pct) but low overall directional movement (price_change_pct)
            # Penalize coins that moved more than 10% directionally
            if price_change_pct < 10.0:
                score = atr_pct / (price_change_pct + 1) # Add 1 to avoid division by zero
                logger.debug(f"{symbol} - ATR: {atr_pct:.2f}%, Change: {price_change_pct:.2f}%, Score: {score:.2f}")
                scored_coins.append((score, symbol))
                    
            await asyncio.sleep(0.2) # Rate limit protection
            
        # Ordenar de mayor a menor score
        scored_coins.sort(key=lambda x: x[0], reverse=True)
        return [coin[1] for coin in scored_coins]

    async def start_websocket_stream(self, symbol, state):
        """Start listening to real-time price updates via native Binance websockets"""
        logger.info(f"Starting real-time websocket stream for {symbol}")
        
        # Convert symbol like 'BTC/USDT' to 'btcusdt' for the websocket URL
        ws_symbol = symbol.replace('/', '').replace(':USDT', '').lower()
        ws_url = f"wss://fstream.binance.com/ws/{ws_symbol}@ticker"
        
        last_position_check = time.time()
        
        while True:
            try:
                async with websockets.connect(ws_url) as ws:
                    logger.info(f"Connected to Binance Futures WebSocket for {ws_symbol}")
                    while True:
                        # 1. Heartbeat de Reconciliación Manual (cada 60s)
                        if time.time() - last_position_check > 60:
                            last_position_check = time.time()
                            try:
                                positions = await self.exchange.fetch_positions([symbol], params={'type': 'future'})
                                is_open = False
                                for pos in positions:
                                    if pos['symbol'] == symbol and float(pos.get('contracts', 0)) > 0:
                                        is_open = True
                                        break
                                        
                                if not is_open:
                                    logger.warning(f"🚨 [{symbol}] Cierre Manual Detectado (Posición en 0). Iniciando limpieza...")
                                    try:
                                        await self.exchange.cancel_all_orders(symbol)
                                    except Exception as e:
                                        logger.error(f"Error cancelando hanging orders: {e}")
                                        
                                    if os.path.exists(self.state_file):
                                        os.remove(self.state_file)
                                        
                                    await notifier.send_message(f"🚨 <b>Intervención Manual Detectada</b>\n\nLa posición de {symbol} fue cerrada manualmente o liquidada.\n\nEl bot ha limpiado la red y buscará una nueva moneda.")
                                    return # Romper el websocket y reiniciar el ciclo
                            except Exception as e:
                                logger.error(f"Error en el chequeo de posición manual: {e}")

                        # 2. Lectura del Precio en Tiempo Real (Timeout de 5s para no bloquear el Heartbeat)
                        try:
                            response = await asyncio.wait_for(ws.recv(), timeout=5.0)
                            data = json.loads(response)
                            
                            if 'c' in data:
                                current_price = float(data['c'])
                                
                                # Revisar si se alcanzó el TP o SL global
                                session_ended = await self.check_grid_triggers(symbol, current_price, state)
                                if session_ended:
                                    logger.info(f"Sesión finalizada para {symbol}. Saliendo del WebSocket.")
                                    return 
                        except asyncio.TimeoutError:
                            # Timeout esperado, permite que el bucle evalúe el heartbeat
                            continue
                            
            except Exception as e:
                logger.error(f"Websocket error for {symbol}: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)

    async def check_grid_triggers(self, symbol, current_price, state):
        """Monitors for Global TP / SL and triggers auto-renewal"""
        tp = state['take_profit']
        sl = state['stop_loss']
        trend = state['trend']
        
        trigger_close = False
        reason = ""
        
        if trend == 'BULLISH':
            if current_price >= tp:
                trigger_close, reason = True, "🎯 TAKE PROFIT GLOBAL ALCANZADO"
            elif current_price <= sl:
                trigger_close, reason = True, "🛑 STOP LOSS GLOBAL ALCANZADO"
        elif trend == 'BEARISH':
            if current_price <= tp:
                trigger_close, reason = True, "🎯 TAKE PROFIT GLOBAL ALCANZADO"
            elif current_price >= sl:
                trigger_close, reason = True, "🛑 STOP LOSS GLOBAL ALCANZADO"
                
        if trigger_close:
            logger.warning(f"[{symbol}] {reason} a {current_price:.4f}")
            logger.info("Esperando 3s para que Binance ejecute el Hard Stop nativo...")
            await asyncio.sleep(3)
            
            # 1. Limpieza de Hanging Orders (Cancela el Grid y el SL/TP contrario)
            try:
                await self.exchange.cancel_all_orders(symbol)
                logger.info("Hanging orders (órdenes colgadas) canceladas exitosamente.")
                
                # 2. Fallback de Emergencia: Verificar si quedó posición abierta
                positions = await self.exchange.fetch_positions([symbol], params={'type': 'future'})
                for pos in positions:
                    if pos['symbol'] == symbol and float(pos['contracts']) > 0:
                        logger.warning("¡Posición aún abierta tras Hard Stop! Ejecutando cierre manual de emergencia...")
                        side = 'sell' if pos['side'] == 'long' else 'buy'
                        await self.exchange.create_market_order(symbol, side, pos['contracts'], params={'reduceOnly': True})
                        logger.info(f"Posición de emergencia de {pos['contracts']} cerrada a mercado.")
            except Exception as e:
                logger.error(f"Error en limpieza post-sesión en {symbol}: {e}")
                
            await notifier.send_message(f"🚨 <b>Sesión de Grid Finalizada (Hard Stop ejecutado)</b>\n\n🎯 <b>Moneda:</b> {symbol}\n📊 <b>Razón:</b> {reason}\n💲 <b>Precio Salida:</b> {current_price:.4f}\n\n<i>Buscando nueva oportunidad en 5 minutos...</i>")
            
            # 3. Borrar el estado para permitir la autorenovación
            if os.path.exists(self.state_file):
                os.remove(self.state_file)
                
            return True
            
        return False

    async def get_macro_trend(self, symbol):
        """Detect macro trend using 4H EMA 50 to define directional grid bias"""
        logger.info(f"[{symbol}] Calculando tendencia macro (4H EMA 50)...")
        df = await self.fetch_klines(symbol, '4h', 100)
        if df is None or len(df) < 50:
            logger.warning(f"[{symbol}] Datos insuficientes para EMA 50. Asumiendo NEUTRAL.")
            return 'NEUTRAL'
        
        # Calculate EMA 50
        df['ema_50'] = df['close'].ewm(span=50, adjust=False).mean()
        current_close = df['close'].iloc[-1]
        ema_50 = df['ema_50'].iloc[-1]
        
        if current_close > ema_50:
            logger.info(f"[{symbol}] Tendencia: ALCISTA (BULLISH) - Precio: {current_close:.4f} > EMA50: {ema_50:.4f}")
            return 'BULLISH'
        else:
            logger.info(f"[{symbol}] Tendencia: BAJISTA (BEARISH) - Precio: {current_close:.4f} < EMA50: {ema_50:.4f}")
            return 'BEARISH'

    async def check_grid_triggers(self, symbol, current_price):
        """Logic to place new grid orders based on price movement"""
        # En un bot de producción aquí escucharíamos el User Data Stream para ver 
        # si una orden se llenó. Por simplicidad, si el precio cruza una orden, 
        # la marcamos y creamos su contraparte (compró -> pongo venta más arriba).
        pass

    async def place_initial_grid(self, symbol, current_price, atr, trade_size):
        """Calculates grid levels using ATR and places initial limit orders directionally"""
        logger.info(f"Calculando niveles del Grid Direccional para {symbol}...")
        
        # Determinar Tendencia Macro
        trend = await self.get_macro_trend(symbol)
        # Rango basado en ATR (Opción B: Direccional, solo cubrimos 1 lado)
        atr_value = atr.iloc[-1]
        directional_range = atr_value * 1.5
        
        upper_price = current_price + directional_range
        lower_price = current_price - directional_range
        
        # Stop loss y Take Profit dependen de la dirección (Opción B)
        if trend == 'BULLISH':
            # Vamos en Largo (Buy). Ganamos si sube.
            take_profit_price = upper_price
            stop_loss_price = lower_price - (atr_value * 1.0)
        elif trend == 'BEARISH':
            # Vamos en Corto (Sell). Ganamos si baja.
            take_profit_price = lower_price
            stop_loss_price = upper_price + (atr_value * 1.0)
        else:
            # Neutral fallback
            take_profit_price = upper_price
            stop_loss_price = lower_price - (atr_value * 1.0)
        
        ideal_gap_pct = 0.004 # 0.4%
        ideal_gap = current_price * ideal_gap_pct
        
        # 2. Determinamos la cantidad de grillas usando el gap ideal para el rango direccional (Mínimo 10)
        grid_levels = max(10, int(directional_range / ideal_gap))
        
        # 3. Consultar el límite mínimo dinámico de la moneda en Binance
        market = self.exchange.markets.get(symbol, {})
        cost_min = market.get('limits', {}).get('cost', {}).get('min', 5.0)
        amount_min = market.get('limits', {}).get('amount', {}).get('min', 0.001)
        
        if not cost_min or cost_min <= 0:
            cost_min = 5.0
            
        # El requerimiento real en USDT también depende de comprar al menos la cantidad mínima de la moneda
        true_min_notional = max(cost_min, amount_min * current_price)
            
        logger.info(f"Min Notional real detectado para {symbol}: {true_min_notional:.2f} USDT (Cost: {cost_min}, QtyMin: {amount_min})")
        
        capital_per_grid = trade_size / grid_levels
        
        leverage = 1
        if capital_per_grid < true_min_notional:
            # Necesitamos apalancamiento
            required_leverage = math.ceil(true_min_notional / capital_per_grid)
            if required_leverage <= MAX_LEVERAGE:
                leverage = required_leverage
            else:
                # Si ni con el apalancamiento máximo llegamos, debemos reducir las grillas
                leverage = MAX_LEVERAGE
                # Calculamos cuántas grillas caben como máximo con este apalancamiento tope
                new_grid_levels = int((trade_size * leverage) / true_min_notional)
                if new_grid_levels < 10:
                    logger.warning(f"[{symbol}] Capital insuficiente incluso con x10. Requiere mínimo 10 grillas. Descartando moneda.")
                    return False
                
                logger.warning(f"Capital insuficiente. Reduciendo de {grid_levels} a {new_grid_levels} grillas.")
                grid_levels = new_grid_levels
        
        # Recalcular tamaño y gap final tras ajustes direccionales
        actual_gap = directional_range / grid_levels
        actual_gap_pct = (actual_gap / current_price) * 100
        capital_per_grid = trade_size / grid_levels
        leveraged_size = capital_per_grid * leverage
        
        # Control anti-liquidación del SL (Adaptado al apalancamiento actual)
        # Liquidación ocurre cuando cae (100 / leverage) %
        max_safe_drop_pct = (100.0 / leverage) * 0.85 # Dejamos 15% de margen antes de liquidación
        sl_distance_pct = abs(current_price - stop_loss_price) / current_price * 100
        
        if sl_distance_pct >= max_safe_drop_pct:
            logger.warning(f"⚠️ SL muy lejano ({sl_distance_pct:.2f}%). Ajustando por seguridad a un máximo de {max_safe_drop_pct:.2f}%.")
            if trend == 'BULLISH':
                stop_loss_price = current_price * (1 - (max_safe_drop_pct / 100.0))
            elif trend == 'BEARISH':
                stop_loss_price = current_price * (1 + (max_safe_drop_pct / 100.0))
            
        logger.info(f"Grid Range: {lower_price:.4f} a {upper_price:.4f} | Levels: {grid_levels} | Gap: {actual_gap:.4f} ({actual_gap_pct:.2f}%)")
        logger.info(f"Capital por grid: {capital_per_grid:.2f} USDT (Apalancado x{leverage}: {leveraged_size:.2f} USDT)")
        
        # Set leverage en Binance
        try:
            await self.exchange.set_leverage(leverage, symbol)
            logger.info(f"Apalancamiento ajustado a x{leverage} para {symbol}")
        except Exception as e:
            logger.error(f"Error ajustando apalancamiento: {e}")

        # Ejecución de la lógica Direccional (Opción B)
        logger.warning("⚠️ INYECTANDO ÓRDENES REALES EN BINANCE...")
        if trend == 'BULLISH':
            # Tendencia Alcista -> Solo colocamos órdenes BUY por debajo del precio
            for i in range(0, grid_levels):
                if i == 0:
                    # PRIMER GRID: Entrada Inmediata a Mercado
                    raw_price = current_price
                    raw_amount = leveraged_size / raw_price
                    price = float(self.exchange.price_to_precision(symbol, raw_price))
                    if raw_amount < amount_min:
                        raw_amount = amount_min
                    amount = float(self.exchange.amount_to_precision(symbol, raw_amount))
                    
                    if (price * amount) < true_min_notional:
                        amount += amount_min
                        amount = float(self.exchange.amount_to_precision(symbol, amount))
                        
                    try:
                        if amount > 0:
                            await self.exchange.create_order(symbol, 'market', 'buy', amount)
                            logger.info(f"✅ Primera Orden BUY (MERCADO) ejecutada -> Monto: {amount}")
                    except Exception as e:
                        logger.error(f"❌ Error al colocar orden BUY de Mercado: {e}")
                else:
                    raw_price = current_price - (actual_gap * i)
                    raw_amount = leveraged_size / raw_price
                    
                    price = float(self.exchange.price_to_precision(symbol, raw_price))
                    if raw_amount < amount_min:
                        raw_amount = amount_min
                    amount = float(self.exchange.amount_to_precision(symbol, raw_amount))
                    
                    # REPARACIÓN DE TRUNCAMIENTO: Asegurar que el notional redondeado cumpla con el mínimo
                    if (price * amount) < true_min_notional:
                        amount += amount_min
                        amount = float(self.exchange.amount_to_precision(symbol, amount))
                    
                    try:
                        if amount > 0:
                            await self.exchange.create_order(symbol, 'limit', 'buy', amount, price)
                            logger.info(f"✅ Orden BUY colocada -> Monto: {amount} | Precio: {price}")
                    except Exception as e:
                        logger.error(f"❌ Error al colocar orden BUY: {e}")
        elif trend == 'BEARISH':
            # Tendencia Bajista -> Solo colocamos órdenes SELL por encima del precio
            for i in range(0, grid_levels):
                if i == 0:
                    # PRIMER GRID: Entrada Inmediata a Mercado
                    raw_price = current_price
                    raw_amount = leveraged_size / raw_price
                    price = float(self.exchange.price_to_precision(symbol, raw_price))
                    if raw_amount < amount_min:
                        raw_amount = amount_min
                    amount = float(self.exchange.amount_to_precision(symbol, raw_amount))
                    
                    if (price * amount) < true_min_notional:
                        amount += amount_min
                        amount = float(self.exchange.amount_to_precision(symbol, amount))
                        
                    try:
                        if amount > 0:
                            await self.exchange.create_order(symbol, 'market', 'sell', amount)
                            logger.info(f"✅ Primera Orden SELL (MERCADO) ejecutada -> Monto: {amount}")
                    except Exception as e:
                        logger.error(f"❌ Error al colocar orden SELL de Mercado: {e}")
                else:
                    raw_price = current_price + (actual_gap * i)
                    raw_amount = leveraged_size / raw_price
                    
                    price = float(self.exchange.price_to_precision(symbol, raw_price))
                    if raw_amount < amount_min:
                        raw_amount = amount_min
                    amount = float(self.exchange.amount_to_precision(symbol, raw_amount))
                    
                    # REPARACIÓN DE TRUNCAMIENTO: Asegurar que el notional redondeado cumpla con el mínimo
                    if (price * amount) < true_min_notional:
                        amount += amount_min
                        amount = float(self.exchange.amount_to_precision(symbol, amount))
                    
                    try:
                        if amount > 0:
                            await self.exchange.create_order(symbol, 'limit', 'sell', amount, price)
                            logger.info(f"✅ Orden SELL colocada -> Monto: {amount} | Precio: {price}")
                    except Exception as e:
                        logger.error(f"❌ Error al colocar orden SELL: {e}")
        
        # INYECCIÓN DE HARD STOPS (Protección Anti-Crash) en Binance
        logger.warning("🛡️ Inyectando Hard Stops en Binance (closePosition=True)...")
        try:
            # Determinamos el lado opuesto para cerrar la posición
            close_side = 'sell' if trend == 'BULLISH' else 'buy'
            
            # Formateo de precios para los stops
            formatted_sl = float(self.exchange.price_to_precision(symbol, stop_loss_price))
            formatted_tp = float(self.exchange.price_to_precision(symbol, take_profit_price))
            
            # Usamos amount_min para satisfacer a CCXT, pero closePosition=True instruye a Binance a cerrar TODO.
            sl_params = {'stopPrice': formatted_sl, 'closePosition': True}
            await self.exchange.create_order(symbol, 'STOP_MARKET', close_side, amount=amount_min, price=None, params=sl_params)
            logger.info(f"🛡️ Hard Stop Loss inyectado en Binance a {formatted_sl}")
            
            tp_params = {'stopPrice': formatted_tp, 'closePosition': True}
            await self.exchange.create_order(symbol, 'TAKE_PROFIT_MARKET', close_side, amount=amount_min, price=None, params=tp_params)
            logger.info(f"🎯 Hard Take Profit inyectado en Binance a {formatted_tp}")
        except Exception as e:
            logger.error(f"❌ Error crítico al inyectar Hard Stops: {e}")
        
        await notifier.send_message(
            f"📈 <b>Grid Calculado ({symbol})</b>\n\n"
            f"🧭 <b>Tendencia (EMA50):</b> {trend}\n"
            f"🔹 <b>Precio Actual:</b> {current_price:.4f}\n"
            f"🔼 <b>Techo:</b> {upper_price:.4f}\n"
            f"🔽 <b>Piso:</b> {lower_price:.4f}\n"
            f"📏 <b>Niveles:</b> {grid_levels} (Gap: {actual_gap_pct:.2f}% por nivel)\n"
            f"⚡ <b>Apalancamiento Usado:</b> x{leverage}\n"
            f"💰 <b>Ord. Size:</b> {leveraged_size:.2f} USDT\n\n"
            f"🛡️ <b>Stop Loss:</b> {stop_loss_price:.4f}\n"
            f"🎯 <b>Take Profit:</b> {take_profit_price:.4f}"
        )
        
        # Guardar estado para auto-recuperación
        self.save_state(symbol, trend, grid_levels, stop_loss_price, take_profit_price, leveraged_size)
        
        return {
            'symbol': symbol,
            'trend': trend,
            'grid_levels': grid_levels,
            'stop_loss': stop_loss_price,
            'take_profit': take_profit_price,
            'leveraged_size': leveraged_size,
            'open_orders': []
        }

    async def run(self):
        """Main lifecycle of the bot (24/7 Autorenewal Loop)"""
        while True:
            # 0. Check for existing state (Auto-Recovery)
            active_state = self.load_state()
            if active_state:
                target_symbol = active_state['symbol']
                logger.info(f"🚀 Reanudando sesión anterior para {target_symbol}")
                await notifier.send_message(f"🔄 <b>Bot Reiniciado</b>\nReanudando grid en <b>{target_symbol}</b> desde el último estado guardado.")
                await self.start_websocket_stream(target_symbol, active_state)
                # Si sale del websocket, significa que el grid cerró. Esperamos y volvemos a empezar.
                logger.info("Esperando 5 minutos antes de escanear nuevas monedas...")
                await asyncio.sleep(300)
                continue

            # 1. Fetch Top Coins (Top 20)
            top_coins = await self.fetch_top_volume_coins(limit=20)
            
            # 2. Analizar Monedas y Obtener Lista de Mejores Opciones
            ranked_coins = await self.analyze_and_pick_best_coin(top_coins)
            if not ranked_coins:
                logger.warning("No perfect ranging coin found. Falling back to top list.")
                ranked_coins = top_coins[:5] if top_coins else ["BTC/USDT"]
                
            # 3. Calculate Trade Size
            trade_size = await self.get_dynamic_trade_size()
            if trade_size <= 0:
                logger.error("Insufficient balance to start trading. Exiting.")
                await notifier.send_message("❌ <b>Error:</b> Balance insuficiente en Binance Futures para iniciar el Grid.")
                await asyncio.sleep(300)
                continue

            # 4. Probar viabilidad del Grid en cascada
            target_symbol = None
            for symbol in ranked_coins:
                logger.info(f"Evaluando viabilidad financiera para {symbol}...")
                df = await self.fetch_klines(symbol, '1h', 14)
                if df is None:
                    continue
                    
                atr = self.calculate_atr(df, 14)
                if atr is not None:
                    current_price = df['close'].iloc[-1]
                    success_state = await self.place_initial_grid(symbol, current_price, atr, trade_size)
                    if success_state:
                        target_symbol = symbol
                        active_state = success_state
                        break
                        
            if not target_symbol:
                logger.error("Ninguna moneda en el top pudo ser operada con el capital actual.")
                await notifier.send_message("❌ <b>Error:</b> Tu capital es insuficiente para operar al menos 10 grillas en el top. Reintentando en 15m.")
                await asyncio.sleep(900)
                continue

            # Notificar a Telegram
            msg = (
                f"🤖 <b>Bot Cripto Iniciado (LIVE)</b>\n\n"
                f"🎯 <b>Moneda Ganadora:</b> {target_symbol}\n"
                f"💰 <b>Capital Asignado:</b> {trade_size:.2f} USDT (90%)\n"
                f"📊 <b>Estrategia:</b> Grid Direccional\n"
                f"✅ Conectando a WebSockets..."
            )
            await notifier.send_message(msg)

            # 5. Connect to WebSockets
            logger.info(f"Starting grid bot on {target_symbol} with {trade_size:.2f} USDT")
            await self.start_websocket_stream(target_symbol, active_state)
            
            # Si el websocket retorna, significa que el grid fue cerrado por TP o SL.
            logger.info("Ciclo del grid completado. Durmiendo 5 minutos antes de nueva búsqueda.")
            await asyncio.sleep(300)

    async def close(self):
        await self.exchange.close()

if __name__ == "__main__":
    bot = CryptoGridBot()
    try:
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        logger.info("Shutting down bot...")
    finally:
        asyncio.run(bot.close())
