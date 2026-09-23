import pandas as pd
import numpy as np
import ta
import os

def run_funding_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    portfolio_stats = {
        "1_SinFiltro": {"W": 0, "L": 0, "Bal": 0},
        "2_FiltroKamikaze": {"W": 0, "L": 0, "Bal": 0},
        "3_FiltroAlineado": {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_15m.csv"): continue
            
        df = pd.read_csv(f"data_dl/{coin}_15m.csv")
        df_fund = pd.read_csv(f"data_dl/{coin}_funding.csv")
        
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        df_fund['datetime'] = pd.to_datetime(df_fund['calc_time'], unit='ms')
        df_fund.set_index('datetime', inplace=True)
        df_fund.sort_index(inplace=True)
        
        df = df.join(df_fund[['funding_rate']], how='left')
        df['funding_rate'] = df['funding_rate'].ffill().fillna(0)
        
        # Indicators for MACD Zero-Cross
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
                
                # Risk $10, Reward $20
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

        # 1. Sin Filtro
        def strat_sin_filtro(data):
            sig = pd.Series(index=data.index, dtype=object)
            sig[base_long] = "LONG"
            sig[base_short] = "SHORT"
            return sig

        # 2. Filtro Kamikaze (Invierte si Funding está en contra)
        def strat_kamikaze(data):
            sig = pd.Series(index=data.index, dtype=object)
            
            # Si Funding > 0 (euforia), y base es LONG -> Invierte a SHORT
            kamikaze_short = base_long & (data['funding_rate'] > 0.0001)
            # Si Funding < 0 (panico), y base es SHORT -> Invierte a LONG
            kamikaze_long = base_short & (data['funding_rate'] < -0.0001)
            
            # Si no hay condiciones extremas, sigue la base
            normal_long = base_long & (data['funding_rate'] <= 0.0001)
            normal_short = base_short & (data['funding_rate'] >= -0.0001)
            
            sig[normal_long | kamikaze_long] = "LONG"
            sig[normal_short | kamikaze_short] = "SHORT"
            return sig

        # 3. Filtro Alineado (Solo opera si Funding apoya)
        def strat_alineado(data):
            sig = pd.Series(index=data.index, dtype=object)
            # Solo ir LONG si el mercado está eufórico (FR > 0)
            alineado_long = base_long & (data['funding_rate'] >= 0)
            # Solo ir SHORT si el mercado está pesimista (FR <= 0)
            alineado_short = base_short & (data['funding_rate'] <= 0)
            
            sig[alineado_long] = "LONG"
            sig[alineado_short] = "SHORT"
            return sig

        w1, l1, b1 = run_sim(strat_sin_filtro)
        w2, l2, b2 = run_sim(strat_kamikaze)
        w3, l3, b3 = run_sim(strat_alineado)
        
        portfolio_stats["1_SinFiltro"]["W"] += w1; portfolio_stats["1_SinFiltro"]["L"] += l1; portfolio_stats["1_SinFiltro"]["Bal"] += b1
        portfolio_stats["2_FiltroKamikaze"]["W"] += w2; portfolio_stats["2_FiltroKamikaze"]["L"] += l2; portfolio_stats["2_FiltroKamikaze"]["Bal"] += b2
        portfolio_stats["3_FiltroAlineado"]["W"] += w3; portfolio_stats["3_FiltroAlineado"]["L"] += l3; portfolio_stats["3_FiltroAlineado"]["Bal"] += b3

    print("\n" + "="*50)
    print(" ANÁLISIS DEL FUNDING RATE (10 MONEDAS x 3.5 AÑOS) ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_funding_backtest()
