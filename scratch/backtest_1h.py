import pandas as pd
import numpy as np
import ta
import os

def run_1h_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    print("Cargando BTC base (1h)...")
    btc = pd.read_csv("data_dl/BTCUSDT_1h.csv")
    btc['datetime'] = pd.to_datetime(btc['open_time'], unit='ms')
    btc.set_index('datetime', inplace=True)
    btc.sort_index(inplace=True)
    
    # BTC Macro trend (EMA 200 on 1h = EMA 50 on 4h)
    btc['ema_macro'] = ta.trend.ema_indicator(btc['close'], window=200)
    btc['macro_trend'] = np.where(btc['close'] > btc['ema_macro'], "UP", "DOWN")
    
    portfolio_stats = {
        "S1_MACD_Seguro": {"W": 0, "L": 0, "Bal": 0},
        "S2_Fakeout_Puro": {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_1h.csv"):
            continue
            
        print(f"Procesando {coin}...")
        df = pd.read_csv(f"data_dl/{coin}_1h.csv")
        df_fund = pd.read_csv(f"data_dl/{coin}_funding.csv")
        
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        df_fund['datetime'] = pd.to_datetime(df_fund['calc_time'], unit='ms')
        df_fund.set_index('datetime', inplace=True)
        df_fund.sort_index(inplace=True)
        
        df = df.join(df_fund[['funding_rate']], how='left')
        df['funding_rate'] = df['funding_rate'].ffill().fillna(0)
        
        df = df.join(btc[['close', 'macro_trend']], rsuffix='_btc', how='left')
        df['corr_btc'] = df['close'].rolling(20).corr(df['close_btc']).fillna(0) # 20 hours correlation
        
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

        # S1: MACD con Seguros (Como está en el bot actualmente)
        def strat_macd_secure(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_trend = data['adx'] >= 25
            trend_up = data['close'] > data['ema_200']
            trend_dn = data['close'] < data['ema_200']
            
            macd_l = (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['macd_hist'].shift(2) < 0)
            macd_s = (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['macd_hist'].shift(2) > 0)
            
            safe_long = ~((data['macro_trend'] == 'DOWN') & (data['corr_btc'] > 0))
            safe_short = ~((data['macro_trend'] == 'UP') & (data['corr_btc'] > 0))
            
            fund_long = data['funding_rate'] >= 0
            fund_short = data['funding_rate'] <= 0
            
            cond_long = is_trend & trend_up & macd_l & safe_long & fund_long
            cond_short = is_trend & trend_dn & macd_s & safe_short & fund_short
            
            sig[cond_long] = "LONG"
            sig[cond_short] = "SHORT"
            return sig

        # S2: Fakeout (Sin seguros, opera mejor en ruido lateral)
        def strat_fakeout(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_range = data['adx'] < 25
            
            fake_down = (data['low'].shift(1) < data['bb_low'].shift(1)) & (data['close'].shift(1) > data['bb_low'].shift(1)) & (data['close'] > data['open'])
            fake_up = (data['high'].shift(1) > data['bb_high'].shift(1)) & (data['close'].shift(1) < data['bb_high'].shift(1)) & (data['close'] < data['open'])
            
            sig[is_range & fake_down] = "LONG"
            sig[is_range & fake_up] = "SHORT"
            return sig

        w1, l1, b1 = run_sim(strat_macd_secure)
        w2, l2, b2 = run_sim(strat_fakeout)
        
        portfolio_stats["S1_MACD_Seguro"]["W"] += w1; portfolio_stats["S1_MACD_Seguro"]["L"] += l1; portfolio_stats["S1_MACD_Seguro"]["Bal"] += b1
        portfolio_stats["S2_Fakeout_Puro"]["W"] += w2; portfolio_stats["S2_Fakeout_Puro"]["L"] += l2; portfolio_stats["S2_Fakeout_Puro"]["Bal"] += b2

    print("\n" + "="*50)
    print(" RESULTADOS PORTAFOLIO EN 1 HORA (1h) - 3.5 AÑOS ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_1h_backtest()
