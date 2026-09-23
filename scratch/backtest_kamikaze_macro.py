import pandas as pd
import numpy as np
import ta
import os

def run_macro_inversion_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    print("Cargando BTC base (15m)...")
    btc = pd.read_csv("data_dl/BTCUSDT_15m.csv")
    btc['datetime'] = pd.to_datetime(btc['open_time'], unit='ms')
    btc.set_index('datetime', inplace=True)
    btc.sort_index(inplace=True)
    
    # BTC Macro trend (EMA 50 in 4H approximated as 800 in 15m)
    btc['ema_macro'] = ta.trend.ema_indicator(btc['close'], window=800)
    btc['macro_trend'] = np.where(btc['close'] > btc['ema_macro'], "UP", "DOWN")
    
    portfolio_stats = {
        "1_MACD_Filtro_Bloqueo": {"W": 0, "L": 0, "Bal": 0},
        "2_MACD_Kamikaze_Macro": {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_15m.csv"): continue
            
        df = pd.read_csv(f"data_dl/{coin}_15m.csv")
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        df = df.join(btc[['close', 'macro_trend']], rsuffix='_btc', how='left')
        df['corr_btc'] = df['close'].rolling(20).corr(df['close_btc']).fillna(0)
        
        df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        
        adx_ind = ta.trend.ADXIndicator(df['high'], df['low'], df['close'], window=14)
        df['adx'] = adx_ind.adx()
        
        macd = ta.trend.MACD(df['close'], window_fast=12, window_slow=26, window_sign=9)
        df['macd_hist'] = macd.macd_diff()
        
        df.dropna(inplace=True)
        
        def run_sim(logic_func):
            wins, losses, bal = 0, 0, 0
            signals = logic_func(df)
            signal_indices = np.where(signals.notna())[0]
            
            closes = df['close'].values
            highs = df['high'].values
            lows = df['low'].values
            atrs = df['atr'].values
            
            for idx in signal_indices:
                dir = signals.iloc[idx]
                entry = closes[idx]
                atr = atrs[idx]
                
                sl = entry - (atr * 1.0) if dir == "LONG" else entry + (atr * 1.0)
                tp = entry + (atr * 2.0) if dir == "LONG" else entry - (atr * 2.0)
                    
                for j in range(idx + 1, len(closes)):
                    h, l = highs[j], lows[j]
                    if dir == "LONG":
                        if l <= sl: losses += 1; bal -= 10; break
                        if h >= tp: wins += 1; bal += 20; break
                    else:
                        if h >= sl: losses += 1; bal -= 10; break
                        if l <= tp: wins += 1; bal += 20; break
            return wins, losses, bal

        # Base MACD Strategy Rules
        is_trend = df['adx'] >= 25
        trend_up = df['close'] > df['ema_200']
        trend_dn = df['close'] < df['ema_200']
        macd_l = (df['macd_hist'] > 0) & (df['macd_hist'].shift(1) < 0) & (df['macd_hist'].shift(2) < 0)
        macd_s = (df['macd_hist'] < 0) & (df['macd_hist'].shift(1) > 0) & (df['macd_hist'].shift(2) > 0)
        
        base_long = is_trend & trend_up & macd_l
        base_short = is_trend & trend_dn & macd_s
        
        macro_clash_long = (df['macro_trend'] == 'DOWN') & (df['corr_btc'] > 0)
        macro_clash_short = (df['macro_trend'] == 'UP') & (df['corr_btc'] > 0)

        # 1. Filtro Bloqueo (Actual, Solo aborta)
        def strat_bloqueo(data):
            sig = pd.Series(index=data.index, dtype=object)
            sig[base_long & ~macro_clash_long] = "LONG"
            sig[base_short & ~macro_clash_short] = "SHORT"
            return sig

        # 2. Kamikaze Macro (El usuario propone invertir la señal si el Macro bloquea)
        def strat_kamikaze(data):
            sig = pd.Series(index=data.index, dtype=object)
            # Los trades buenos normales
            sig[base_long & ~macro_clash_long] = "LONG"
            sig[base_short & ~macro_clash_short] = "SHORT"
            
            # Los trades bloqueados los INVERTIMOS
            # Quería ir LONG, pero BTC baja -> Vamos SHORT
            sig[base_long & macro_clash_long] = "SHORT"
            # Quería ir SHORT, pero BTC sube -> Vamos LONG
            sig[base_short & macro_clash_short] = "LONG"
            
            return sig

        w1, l1, b1 = run_sim(strat_bloqueo)
        w2, l2, b2 = run_sim(strat_kamikaze)
        
        portfolio_stats["1_MACD_Filtro_Bloqueo"]["W"] += w1; portfolio_stats["1_MACD_Filtro_Bloqueo"]["L"] += l1; portfolio_stats["1_MACD_Filtro_Bloqueo"]["Bal"] += b1
        portfolio_stats["2_MACD_Kamikaze_Macro"]["W"] += w2; portfolio_stats["2_MACD_Kamikaze_Macro"]["L"] += l2; portfolio_stats["2_MACD_Kamikaze_Macro"]["Bal"] += b2

    print("\n" + "="*50)
    print(" ANÁLISIS DE INVERSIÓN MACRO (10 MONEDAS x 3.5 AÑOS) ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_macro_inversion_backtest()
