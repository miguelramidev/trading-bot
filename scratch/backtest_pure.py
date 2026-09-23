import pandas as pd
import numpy as np
import ta
import os

def run_pure_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    portfolio_stats = {
        "S1_MACD_Puro": {"W": 0, "L": 0, "Bal": 0},
        "S2_Fakeout_Puro": {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_15m.csv"): continue
            
        print(f"Procesando {coin}...")
        df = pd.read_csv(f"data_dl/{coin}_15m.csv")
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        # Indicators
        df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        
        adx_ind = ta.trend.ADXIndicator(df['high'], df['low'], df['close'], window=14)
        df['adx'] = adx_ind.adx()
        
        macd = ta.trend.MACD(df['close'], window_fast=12, window_slow=26, window_sign=9)
        df['macd_hist'] = macd.macd_diff()
        
        bb = ta.volatility.BollingerBands(df['close'], window=20, window_dev=2)
        df['bb_high'] = bb.bollinger_hband()
        df['bb_low'] = bb.bollinger_lband()
        
        df.dropna(inplace=True)
        
        def run_sim(logic_func, tp_multiplier=2.0):
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
                
                # Risk $10
                sl = entry - (atr * 1.0) if dir == "LONG" else entry + (atr * 1.0)
                tp = entry + (atr * tp_multiplier) if dir == "LONG" else entry - (atr * tp_multiplier)
                    
                for j in range(idx + 1, len(closes)):
                    h, l = highs[j], lows[j]
                    if dir == "LONG":
                        if l <= sl: losses += 1; bal -= 10; break
                        if h >= tp: wins += 1; bal += 20; break
                    else:
                        if h >= sl: losses += 1; bal -= 10; break
                        if l <= tp: wins += 1; bal += 20; break
            return wins, losses, bal

        # S1: MACD Zero-Cross PURO (Sin Seguros)
        def strat_macd(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_trend = data['adx'] >= 25
            trend_up = data['close'] > data['ema_200']
            trend_dn = data['close'] < data['ema_200']
            
            macd_l = (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['macd_hist'].shift(2) < 0)
            macd_s = (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['macd_hist'].shift(2) > 0)
            
            sig[is_trend & trend_up & macd_l] = "LONG"
            sig[is_trend & trend_dn & macd_s] = "SHORT"
            return sig

        # S2: Fakeout PURO (Sin Seguros)
        def strat_fakeout(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_range = data['adx'] < 25
            
            fake_down = (data['low'].shift(1) < data['bb_low'].shift(1)) & (data['close'].shift(1) > data['bb_low'].shift(1)) & (data['close'] > data['open'])
            fake_up = (data['high'].shift(1) > data['bb_high'].shift(1)) & (data['close'].shift(1) < data['bb_high'].shift(1)) & (data['close'] < data['open'])
            
            sig[is_range & fake_down] = "LONG"
            sig[is_range & fake_up] = "SHORT"
            return sig

        w1, l1, b1 = run_sim(strat_macd, 2.0)
        w2, l2, b2 = run_sim(strat_fakeout, 2.0)
        
        portfolio_stats["S1_MACD_Puro"]["W"] += w1; portfolio_stats["S1_MACD_Puro"]["L"] += l1; portfolio_stats["S1_MACD_Puro"]["Bal"] += b1
        portfolio_stats["S2_Fakeout_Puro"]["W"] += w2; portfolio_stats["S2_Fakeout_Puro"]["L"] += l2; portfolio_stats["S2_Fakeout_Puro"]["Bal"] += b2

    print("\n" + "="*50)
    print(" RESULTADOS ESTRATEGIAS PURAS (SIN SEGUROS) - 10 MONEDAS x 3.5 AÑOS ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_pure_backtest()
