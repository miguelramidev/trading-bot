import pandas as pd
import numpy as np
import ta
import sys

def run_backtest():
    print("Cargando datos históricos (3.5 años)...")
    try:
        df = pd.read_csv("data_dl/BTCUSDT_15m.csv")
        df_fund = pd.read_csv("data_dl/BTCUSDT_funding.csv")
    except Exception as e:
        print("Esperando descarga de datos...")
        return

    # Preparar df
    df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
    df.set_index('datetime', inplace=True)
    df.sort_index(inplace=True)
    
    df_fund['datetime'] = pd.to_datetime(df_fund['calc_time'], unit='ms')
    df_fund.set_index('datetime', inplace=True)
    df_fund.sort_index(inplace=True)
    
    # Merge funding rate into df (forward fill, since funding is every 8 hours)
    print("Integrando Funding Rate y calculando indicadores (MACD, ATR, EMA)...")
    df = df.join(df_fund[['funding_rate']], how='left')
    df['funding_rate'] = df['funding_rate'].ffill()
    df['funding_rate'] = df['funding_rate'].fillna(0) # for the very beginning

    # Indicators
    df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
    df['ema_50'] = ta.trend.ema_indicator(df['close'], window=50)
    df['ema_21'] = ta.trend.ema_indicator(df['close'], window=21)
    
    macd = ta.trend.MACD(df['close'], window_fast=12, window_slow=26, window_sign=9)
    df['macd_hist'] = macd.macd_diff()
    
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
    
    df.dropna(inplace=True)
    
    print(f"Total velas procesables: {len(df)}")
    
    # Simulación
    def simulate(strategy_name, logic_func):
        balance = 1000
        wins = 0
        losses = 0
        
        # We can't do a full vectorization easily with SL/TP forward walk without complex logic.
        # So we'll iterate. To make it fast, we'll only look forward when a signal hits.
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        atrs = df['atr'].values
        
        signals = logic_func(df)
        
        # signals is a Series of "LONG", "SHORT", or None
        signal_indices = np.where(signals.notna())[0]
        
        for idx in signal_indices:
            dir = signals.iloc[idx]
            entry = closes[idx]
            atr = atrs[idx]
            
            if dir == "LONG":
                sl = entry - (atr * 1.5)
                tp = entry + (atr * 3.0)
            else:
                sl = entry + (atr * 1.5)
                tp = entry - (atr * 3.0)
                
            # Forward walk
            for j in range(idx + 1, len(closes)):
                h = highs[j]
                l = lows[j]
                if dir == "LONG":
                    if l <= sl:
                        losses += 1
                        balance -= 10
                        break
                    if h >= tp:
                        wins += 1
                        balance += 20
                        break
                else:
                    if h >= sl:
                        losses += 1
                        balance -= 10
                        break
                    if l <= tp:
                        wins += 1
                        balance += 20
                        break

        total = wins + losses
        wr = (wins / total * 100) if total > 0 else 0
        print(f"[{strategy_name}] W: {wins} | L: {losses} | WinRate: {wr:.1f}% | Balance: ${balance:.2f}")

    # --- Estrategia 1: MACD Básico ---
    def macd_basic(data):
        sig = pd.Series(index=data.index, dtype=object)
        
        # Long: Price > EMA200, MACD crosses above 0
        cond_long = (data['close'] > data['ema_200']) & (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['macd_hist'].shift(2) < 0)
        
        # Short: Price < EMA200, MACD crosses below 0
        cond_short = (data['close'] < data['ema_200']) & (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['macd_hist'].shift(2) > 0)
        
        sig[cond_long] = "LONG"
        sig[cond_short] = "SHORT"
        return sig

    # --- Estrategia 2: MACD + Funding Rate Filter ---
    # No ir LONG si Funding > 0.01% (Muy sobrecomprado, riesgo de long squeeze)
    # No ir SHORT si Funding < -0.01% (Muy sobrevendido, riesgo de short squeeze)
    def macd_funding(data):
        sig = pd.Series(index=data.index, dtype=object)
        
        cond_long = (data['close'] > data['ema_200']) & (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['funding_rate'] < 0.0001)
        cond_short = (data['close'] < data['ema_200']) & (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['funding_rate'] > -0.0001)
        
        sig[cond_long] = "LONG"
        sig[cond_short] = "SHORT"
        return sig

    simulate("MACD Puro", macd_basic)
    simulate("MACD + Filtro Funding Rate", macd_funding)

if __name__ == "__main__":
    run_backtest()
