import pandas as pd
import numpy as np
import ta
import os

def run_portfolio_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    # Load BTC to compute correlation and macro trend
    print("Cargando BTC base...")
    btc = pd.read_csv("data_dl/BTCUSDT_15m.csv")
    btc['datetime'] = pd.to_datetime(btc['open_time'], unit='ms')
    btc.set_index('datetime', inplace=True)
    btc.sort_index(inplace=True)
    
    # BTC Macro trend (EMA 50 in 4H)
    # We will approximate 4H EMA 50 by using 15m EMA 800 (50 * 16)
    btc['ema_macro'] = ta.trend.ema_indicator(btc['close'], window=800)
    btc['macro_trend'] = np.where(btc['close'] > btc['ema_macro'], "UP", "DOWN")
    
    portfolio_stats = {
        "S1_EMA21": {"W": 0, "L": 0, "Bal": 0},
        "S2_Rango": {"W": 0, "L": 0, "Bal": 0},
        "S3_MACD":  {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_15m.csv"):
            continue
            
        print(f"Procesando {coin}...")
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
        
        # Join BTC closes and macro trend
        df = df.join(btc[['close', 'macro_trend']], rsuffix='_btc', how='left')
        
        # Calculate Rolling Correlation (20 candles ~ 5 hours)
        df['corr_btc'] = df['close'].rolling(20).corr(df['close_btc']).fillna(0)
        
        # Indicators
        df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
        df['ema_21'] = ta.trend.ema_indicator(df['close'], window=21)
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
                sl = entry - (atr * 1.5) if dir == "LONG" else entry + (atr * 1.5)
                tp = entry + (atr * 3.0) if dir == "LONG" else entry - (atr * 3.0)
                    
                for j in range(idx + 1, len(closes)):
                    h, l = highs[j], lows[j]
                    if dir == "LONG":
                        if l <= sl: losses += 1; bal -= 10; break
                        if h >= tp: wins += 1; bal += 20; break
                    else:
                        if h >= sl: losses += 1; bal -= 10; break
                        if l <= tp: wins += 1; bal += 20; break
            return wins, losses, bal

        # S1: Current EMA Pullback
        def strat_1(data):
            sig = pd.Series(index=data.index, dtype=object)
            # Conditions
            trend_up = (data['close'] > data['ema_200']) & (data['adx'] > 25) & (data['adx'] > data['adx'].shift(1))
            trend_dn = (data['close'] < data['ema_200']) & (data['adx'] > 25) & (data['adx'] > data['adx'].shift(1))
            
            pullback_long = (data['low'] <= data['ema_21']) & (data['close'] > data['open'])
            pullback_short = (data['high'] >= data['ema_21']) & (data['close'] < data['open'])
            
            # Seguros: 
            # 1. Macro Trend: Don't short if BTC is UP and Correlation > 0
            safe_long = ~((data['macro_trend'] == 'DOWN') & (data['corr_btc'] > 0))
            safe_short = ~((data['macro_trend'] == 'UP') & (data['corr_btc'] > 0))
            
            # 2. Funding Rate: Follow the crowd
            fund_long = data['funding_rate'] >= 0
            fund_short = data['funding_rate'] <= 0
            
            cond_long = trend_up & pullback_long & safe_long & fund_long
            cond_short = trend_dn & pullback_short & safe_short & fund_short
            
            sig[cond_long] = "LONG"
            sig[cond_short] = "SHORT"
            return sig

        # S2: Rango Bollinger Bands
        def strat_2(data):
            sig = pd.Series(index=data.index, dtype=object)
            range_cond = data['adx'] < 20
            
            bounce_long = (data['low'] <= data['bb_low']) & (data['close'] > data['bb_low'])
            bounce_short = (data['high'] >= data['bb_high']) & (data['close'] < data['bb_high'])
            
            # Seguros: Only trade range if correlation is low (< 0.5) so it doesn't get dragged by BTC breakouts
            safe = data['corr_btc'].abs() < 0.5
            
            cond_long = range_cond & bounce_long & safe
            cond_short = range_cond & bounce_short & safe
            
            sig[cond_long] = "LONG"
            sig[cond_short] = "SHORT"
            return sig

        # S3: MACD Zero-Cross
        def strat_3(data):
            sig = pd.Series(index=data.index, dtype=object)
            trend_up = data['close'] > data['ema_200']
            trend_dn = data['close'] < data['ema_200']
            
            macd_l = (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['macd_hist'].shift(2) < 0)
            macd_s = (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['macd_hist'].shift(2) > 0)
            
            safe_long = ~((data['macro_trend'] == 'DOWN') & (data['corr_btc'] > 0))
            safe_short = ~((data['macro_trend'] == 'UP') & (data['corr_btc'] > 0))
            
            fund_long = data['funding_rate'] >= 0
            fund_short = data['funding_rate'] <= 0
            
            cond_long = trend_up & macd_l & safe_long & fund_long
            cond_short = trend_dn & macd_s & safe_short & fund_short
            
            sig[cond_long] = "LONG"
            sig[cond_short] = "SHORT"
            return sig

        w1, l1, b1 = run_sim(strat_1)
        w2, l2, b2 = run_sim(strat_2)
        w3, l3, b3 = run_sim(strat_3)
        
        portfolio_stats["S1_EMA21"]["W"] += w1; portfolio_stats["S1_EMA21"]["L"] += l1; portfolio_stats["S1_EMA21"]["Bal"] += b1
        portfolio_stats["S2_Rango"]["W"] += w2; portfolio_stats["S2_Rango"]["L"] += l2; portfolio_stats["S2_Rango"]["Bal"] += b2
        portfolio_stats["S3_MACD"]["W"] += w3;  portfolio_stats["S3_MACD"]["L"] += l3;  portfolio_stats["S3_MACD"]["Bal"] += b3

    print("\n" + "="*50)
    print(" RESULTADOS DEL PORTAFOLIO (10 MONEDAS x 3.5 AÑOS) ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000 # Starting with $1000 base
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_portfolio_backtest()
