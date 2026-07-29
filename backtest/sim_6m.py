import os
import sys
import json
import logging
from datetime import datetime, timedelta
import pandas as pd
import pandas_ta as ta

# Ensure we can import MT5
try:
    import MetaTrader5 as mt5
except ImportError:
    print("MetaTrader5 not installed.")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Backtest6M")

SYMBOLS = [
    "BTCUSDc", "ETHUSDc",
    "XAUUSDc", "XAGUSDc",
    "EURUSDc", "GBPUSDc", "AUDUSDc", "NZDUSDc", "USDCADc", "USDCHFc",
    "USDJPYc", "EURJPYc", "GBPJPYc", "AUDJPYc",
    "EURGBPc", "EURAUDc", "GBPAUDc", "AUDCADc", "EURCHFc", "GBPCHFc"
]

CORRELATION_GROUPS = {
    "METALS": ["XAUUSDc", "XAGUSDc"],
    "CRYPTO": ["BTCUSDc", "ETHUSDc"],
    "JPY_PAIRS": ["USDJPYc", "EURJPYc", "GBPJPYc", "AUDJPYc"],
    "USD_MAJORS": ["EURUSDc", "GBPUSDc", "AUDUSDc", "NZDUSDc", "USDCADc", "USDCHFc"],
    "EUR_CROSSES": ["EURGBPc", "EURAUDc", "EURCHFc"],
    "GBP_CROSSES": ["GBPAUDc", "GBPCHFc"],
    "AUD_CROSSES": ["AUDCADc"]
}

def get_group(symbol):
    for group, syms in CORRELATION_GROUPS.items():
        if symbol in syms:
            return group
    return "OTHER"

def get_category(symbol):
    if symbol in ["BTCUSDc", "ETHUSDc"]: return "Criptomonedas"
    if symbol in ["XAUUSDc", "XAGUSDc"]: return "Metales Preciosos"
    if symbol in ["USDJPYc", "EURJPYc", "GBPJPYc", "AUDJPYc"]: return "Cruces del Yen"
    if symbol in ["EURUSDc", "GBPUSDc", "AUDUSDc", "NZDUSDc", "USDCADc", "USDCHFc"]: return "Majors USD"
    return "Cruces Menores"

def load_data(symbols, num_candles=4000):
    if not mt5.initialize():
        logger.error("No se pudo conectar a MT5.")
        return {}
    
    data_map = {}
    for sym in symbols:
        rates = mt5.copy_rates_from_pos(sym, mt5.TIMEFRAME_H1, 0, num_candles)
        if rates is None or len(rates) == 0:
            logger.warning(f"No hay datos para {sym}")
            continue
        df = pd.DataFrame(rates)
        df['time'] = pd.to_datetime(df['time'], unit='s')
        df.set_index('time', inplace=True)
        
        # Calculate H1 indicators
        macd = ta.macd(df['close'], fast=12, slow=26, signal=9)
        if macd is not None and not macd.empty:
            df['macd_hist'] = macd['MACDh_12_26_9']
        else:
            df['macd_hist'] = 0.0
            
        bb = ta.bbands(df['close'], length=20, std=2.0)
        if bb is not None and not bb.empty:
            df['bb_lower'] = bb.iloc[:, 0]
            df['bb_mid'] = bb.iloc[:, 1]
            df['bb_upper'] = bb.iloc[:, 2]
        else:
            df['bb_lower'] = df['close']
            df['bb_upper'] = df['close']
            df['bb_mid'] = df['close']
            
        # Resample H4
        df_4h = df.resample('4h').agg({
            'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
        }).dropna()
        rsi = ta.rsi(df_4h['close'], length=14)
        stoch = ta.stoch(df_4h['high'], df_4h['low'], df_4h['close'], k=14, d=3, smooth_k=3)
        df_4h['rsi'] = rsi if rsi is not None else 50.0
        if stoch is not None and not stoch.empty:
            df_4h['stoch_k'] = stoch['STOCHk_14_3_3']
            df_4h['stoch_d'] = stoch['STOCHd_14_3_3']
        else:
            df_4h['stoch_k'] = 50.0
            df_4h['stoch_d'] = 50.0
            
        # Resample D1
        df_1d = df.resample('1d').agg({
            'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last'
        }).dropna()
        adx = ta.adx(df_1d['high'], df_1d['low'], df_1d['close'], length=14)
        ema = ta.ema(df_1d['close'], length=20)
        atr = ta.atr(df_1d['high'], df_1d['low'], df_1d['close'], length=14)
        if adx is not None and not adx.empty:
            df_1d['adx'] = adx['ADX_14']
        else:
            df_1d['adx'] = 15.0
        df_1d['ema20'] = ema if ema is not None else df_1d['close']
        df_1d['atr'] = atr if atr is not None else (df_1d['high'] - df_1d['low']).mean()
        
        # Forward fill H4 and D1 back to H1
        df_h1_merged = df.copy()
        df_h1_merged['h4_rsi'] = df_4h['rsi'].reindex(df_h1_merged.index, method='ffill')
        df_h1_merged['h4_stoch_k'] = df_4h['stoch_k'].reindex(df_h1_merged.index, method='ffill')
        df_h1_merged['d1_adx'] = df_1d['adx'].reindex(df_h1_merged.index, method='ffill')
        df_h1_merged['d1_ema20'] = df_1d['ema20'].reindex(df_h1_merged.index, method='ffill')
        df_h1_merged['d1_atr'] = df_1d['atr'].reindex(df_h1_merged.index, method='ffill')
        
        data_map[sym] = df_h1_merged.dropna()
        logger.info(f"Cargados {len(data_map[sym])} registros H1 para {sym}")
        
    mt5.shutdown()
    return data_map

def run_simulation(data_map, initial_balance=10000.0, risk_pct=1.0):
    # Use union of all timestamps so newly listed symbols don't restrict the 6-month timeline
    all_times = sorted(list(set.union(*(set(df.index) for df in data_map.values()))))
        
    logger.info(f"Línea de tiempo del backtest: {len(all_times)} velas H1 (Desde {all_times[0]} hasta {all_times[-1]})")
    
    balance = initial_balance
    equity_curve = [initial_balance]
    peak_balance = initial_balance
    max_dd_dollars = 0.0
    max_dd_pct = 0.0
    
    open_positions = []
    closed_trades = []
    
    for i, t in enumerate(all_times):
        # 1. Manage open positions
        current_groups_active = set()
        still_open = []
        
        for pos in open_positions:
            sym = pos['symbol']
            if sym not in data_map or t not in data_map[sym].index:
                still_open.append(pos)
                current_groups_active.add(get_group(sym))
                continue
                
            bar = data_map[sym].loc[t]
            high = bar['high']
            low = bar['low']
            close = bar['close']
            
            # Check Friday Shield at 18:00 UTC on Fridays (weekday == 4)
            is_friday_shield = (t.weekday() == 4 and t.hour == 18 and not pos['is_crypto'])
            
            closed = False
            exit_price = 0.0
            exit_reason = ""
            
            if pos['direction'] == 'BUY':
                dist_1r = pos['dist_1r']
                # Phase 3: High >= open + 2.5R -> SL = open + 2R
                if high >= pos['entry'] + (dist_1r * 2.5):
                    new_sl = pos['entry'] + (dist_1r * 2.0)
                    if new_sl > pos['sl']: pos['sl'] = new_sl
                # Phase 2: High >= open + 2R -> SL = open + 1R
                elif high >= pos['entry'] + (dist_1r * 2.0):
                    new_sl = pos['entry'] + dist_1r
                    if new_sl > pos['sl']: pos['sl'] = new_sl
                # Phase 1: High >= open + 1R -> SL = BE
                elif high >= pos['entry'] + dist_1r:
                    new_sl = pos['entry']
                    if new_sl > pos['sl']: pos['sl'] = new_sl
                    
                # Check SL hit
                if low <= pos['sl']:
                    closed = True
                    exit_price = pos['sl']
                    exit_reason = "SL/TS"
                # Check TP hit
                elif high >= pos['tp']:
                    closed = True
                    exit_price = pos['tp']
                    exit_reason = "TP"
                elif is_friday_shield and close > pos['entry']:
                    closed = True
                    exit_price = close
                    exit_reason = "Friday_Shield"
            else: # SELL
                dist_1r = pos['dist_1r']
                # Phase 3: Low <= open - 2.5R -> SL = open - 2R
                if low <= pos['entry'] - (dist_1r * 2.5):
                    new_sl = pos['entry'] - (dist_1r * 2.0)
                    if new_sl < pos['sl']: pos['sl'] = new_sl
                # Phase 2: Low <= open - 2R -> SL = open - 1R
                elif low <= pos['entry'] - (dist_1r * 2.0):
                    new_sl = pos['entry'] - dist_1r
                    if new_sl < pos['sl']: pos['sl'] = new_sl
                # Phase 1: Low <= open - 1R -> SL = BE
                elif low <= pos['entry'] - dist_1r:
                    new_sl = pos['entry']
                    if new_sl < pos['sl']: pos['sl'] = new_sl
                    
                # Check SL hit
                if high >= pos['sl']:
                    closed = True
                    exit_price = pos['sl']
                    exit_reason = "SL/TS"
                # Check TP hit
                elif low <= pos['tp']:
                    closed = True
                    exit_price = pos['tp']
                    exit_reason = "TP"
                elif is_friday_shield and close < pos['entry']:
                    closed = True
                    exit_price = close
                    exit_reason = "Friday_Shield"
                    
            if closed:
                if pos['direction'] == 'BUY':
                    profit_pts = exit_price - pos['entry']
                else:
                    profit_pts = pos['entry'] - exit_price
                    
                profit_usd = profit_pts * pos['lot_size'] * pos['contract_val']
                balance += profit_usd
                
                closed_trades.append({
                    'symbol': sym,
                    'category': get_category(sym),
                    'strategy': pos['strategy'],
                    'direction': pos['direction'],
                    'entry': pos['entry'],
                    'exit': exit_price,
                    'profit_usd': profit_usd,
                    'win': profit_usd > 0,
                    'reason': exit_reason,
                    'time': str(t)
                })
            else:
                still_open.append(pos)
                current_groups_active.add(get_group(sym))
                
        open_positions = still_open
        
        # Track drawdown
        if balance > peak_balance:
            peak_balance = balance
        dd_usd = peak_balance - balance
        dd_pct = (dd_usd / peak_balance) * 100.0 if peak_balance > 0 else 0.0
        if dd_usd > max_dd_dollars: max_dd_dollars = dd_usd
        if dd_pct > max_dd_pct: max_dd_pct = dd_pct
        equity_curve.append(balance)
        
        # 2. Check for new entries (Alpha Ranking)
        if len(open_positions) >= 8:
            continue
            
        # Rank symbols by Daily ADX
        candidates = []
        for sym in data_map.keys():
            if t not in data_map[sym].index:
                continue
            group = get_group(sym)
            if group in current_groups_active:
                continue
                
            bar = data_map[sym].loc[t]
            adx = bar['d1_adx']
            candidates.append((sym, adx, bar))
            
        # Sort descending by ADX
        candidates.sort(key=lambda x: x[1], reverse=True)
        
        for sym, adx, bar in candidates:
            if len(open_positions) >= 8:
                break
            group = get_group(sym)
            if group in current_groups_active:
                continue
                
            is_crypto = sym.startswith(("BTC", "ETH"))
            adx_thresh = 20.0 if is_crypto else 25.0
            
            if "JPY" in sym:
                contract_val = 650.0 # ~100k JPY/USD approx
            elif "XAU" in sym:
                contract_val = 100.0 # 100 oz gold
            elif "XAG" in sym:
                contract_val = 5000.0
            elif "BTC" in sym:
                contract_val = 1.0
            elif "ETH" in sym:
                contract_val = 1.0
            else:
                contract_val = 1000.0 # Cent lot / standard micro
                
            atr_val = bar['d1_atr']
            if atr_val <= 0: continue
            
            # --- STRATEGY A: TRIPLE SCREEN (TRENDING) ---
            if adx >= adx_thresh:
                trend_bull = bar['close'] > bar['d1_ema20']
                pullback_bull = bar['h4_rsi'] < 48 and bar['h4_stoch_k'] < 35
                pullback_bear = bar['h4_rsi'] > 52 and bar['h4_stoch_k'] > 65
                
                trigger_bull = bar['macd_hist'] > 0
                trigger_bear = bar['macd_hist'] < 0
                
                direction = None
                if trend_bull and pullback_bull and trigger_bull:
                    direction = 'BUY'
                elif not trend_bull and pullback_bear and trigger_bear:
                    direction = 'SELL'
                    
                if direction:
                    entry_price = bar['close']
                    sl_dist = atr_val * (2.0 if is_crypto else 1.5)
                    sl = entry_price - sl_dist if direction == 'BUY' else entry_price + sl_dist
                    dist_1r = sl_dist
                    
                    risk_amount = balance * (risk_pct / 100.0)
                    lot_size = max(0.01, risk_amount / (dist_1r * contract_val))
                    
                    # Split orders: Half A (2R) and Half B (3R)
                    tp_a = entry_price + (dist_1r * 2.0) if direction == 'BUY' else entry_price - (dist_1r * 2.0)
                    tp_b = entry_price + (dist_1r * 3.0) if direction == 'BUY' else entry_price - (dist_1r * 3.0)
                    
                    open_positions.append({
                        'symbol': sym,
                        'strategy': 'TripleScreen_2R',
                        'direction': direction,
                        'entry': entry_price,
                        'sl': sl,
                        'tp': tp_a,
                        'dist_1r': dist_1r,
                        'lot_size': lot_size / 2.0,
                        'contract_val': contract_val,
                        'is_crypto': is_crypto
                    })
                    open_positions.append({
                        'symbol': sym,
                        'strategy': 'TripleScreen_3R',
                        'direction': direction,
                        'entry': entry_price,
                        'sl': sl,
                        'tp': tp_b,
                        'dist_1r': dist_1r,
                        'lot_size': lot_size / 2.0,
                        'contract_val': contract_val,
                        'is_crypto': is_crypto
                    })
                    current_groups_active.add(group)
                    
            # --- STRATEGY B: BOLLINGER BANDS MEAN REVERSION (RANGING) ---
            else:
                bb_lower = bar['bb_lower']
                bb_upper = bar['bb_upper']
                bb_mid = bar['bb_mid']
                low = bar['low']
                high = bar['high']
                close = bar['close']
                
                direction = None
                if low <= bb_lower and close > bb_lower:
                    direction = 'BUY'
                elif high >= bb_upper and close < bb_upper:
                    direction = 'SELL'
                    
                if direction:
                    entry_price = close
                    sl_dist = atr_val * 1.5
                    sl = entry_price - sl_dist if direction == 'BUY' else entry_price + sl_dist
                    dist_1r = sl_dist
                    tp = bb_mid
                    
                    # Ensure minimum 1.5R TP buffer
                    if direction == 'BUY' and (tp - entry_price) < (dist_1r * 1.2):
                        tp = entry_price + (dist_1r * 1.5)
                    elif direction == 'SELL' and (entry_price - tp) < (dist_1r * 1.2):
                        tp = entry_price - (dist_1r * 1.5)
                        
                    risk_amount = balance * (risk_pct / 100.0)
                    lot_size = max(0.01, risk_amount / (dist_1r * contract_val))
                    
                    open_positions.append({
                        'symbol': sym,
                        'strategy': 'MeanReversion_BB',
                        'direction': direction,
                        'entry': entry_price,
                        'sl': sl,
                        'tp': tp,
                        'dist_1r': dist_1r,
                        'lot_size': lot_size,
                        'contract_val': contract_val,
                        'is_crypto': is_crypto
                    })
                    current_groups_active.add(group)
                    
    # Generate statistics
    df_trades = pd.DataFrame(closed_trades)
    total_trades = len(df_trades)
    
    if total_trades == 0:
        logger.warning("No se ejecutaron operaciones.")
        return
        
    wins = df_trades[df_trades['profit_usd'] > 0]
    losses = df_trades[df_trades['profit_usd'] <= 0]
    
    win_rate = (len(wins) / total_trades) * 100.0
    total_profit_usd = df_trades['profit_usd'].sum()
    roi_pct = (total_profit_usd / initial_balance) * 100.0
    
    gross_profit = wins['profit_usd'].sum()
    gross_loss = abs(losses['profit_usd'].sum())
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
    
    logger.info("=========================================")
    logger.info(f"BACKTEST 6 MESES COMPLETADO | {total_trades} Operaciones")
    logger.info(f"ROI Total: +{roi_pct:.2f}% (${total_profit_usd:.2f} USD)")
    logger.info(f"Win Rate: {win_rate:.2f}% ({len(wins)}G / {len(losses)}P)")
    logger.info(f"Profit Factor: {profit_factor:.2f}")
    logger.info(f"Máximo Drawdown: {max_dd_pct:.2f}% (${max_dd_dollars:.2f} USD)")
    logger.info("=========================================")
    
    cat_summary = df_trades.groupby('category').agg(
        trades=('profit_usd', 'count'),
        win_rate=('win', lambda x: (x.sum() / len(x)) * 100.0),
        net_profit=('profit_usd', 'sum')
    ).reset_index()
    
    strat_summary = df_trades.groupby('strategy').agg(
        trades=('profit_usd', 'count'),
        win_rate=('win', lambda x: (x.sum() / len(x)) * 100.0),
        net_profit=('profit_usd', 'sum')
    ).reset_index()
    
    sym_summary = df_trades.groupby('symbol').agg(
        trades=('profit_usd', 'count'),
        win_rate=('win', lambda x: (x.sum() / len(x)) * 100.0),
        net_profit=('profit_usd', 'sum')
    ).sort_values('net_profit', ascending=False).reset_index()
    
    results = {
        'kpi': {
            'initial_balance': initial_balance,
            'final_balance': balance,
            'net_profit_usd': total_profit_usd,
            'roi_pct': roi_pct,
            'win_rate': win_rate,
            'total_trades': total_trades,
            'wins': len(wins),
            'losses': len(losses),
            'profit_factor': profit_factor,
            'max_dd_usd': max_dd_dollars,
            'max_dd_pct': max_dd_pct,
            'start_date': str(all_times[0]),
            'end_date': str(all_times[-1]),
            'total_bars': len(all_times)
        },
        'categories': cat_summary.to_dict(orient='records'),
        'strategies': strat_summary.to_dict(orient='records'),
        'symbols': sym_summary.to_dict(orient='records')
    }
    
    os.makedirs("backtest", exist_ok=True)
    with open("backtest/exness_6m_results.json", "w") as f:
        json.dump(results, f, indent=4)
    logger.info("Resultados guardados en backtest/exness_6m_results.json")

if __name__ == "__main__":
    logger.info("Cargando datos históricos de Exness MT5...")
    data = load_data(SYMBOLS, num_candles=4000)
    if data:
        run_simulation(data)
