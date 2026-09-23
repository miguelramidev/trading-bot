import pandas as pd
import numpy as np
import ta

def run_backtest():
    df = pd.read_csv("data_dl/BTCUSDT_15m.csv")
    df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
    df.set_index('datetime', inplace=True)
    df.sort_index(inplace=True)
    
    df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
    df['ema_21'] = ta.trend.ema_indicator(df['close'], window=21)
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
    adx_ind = ta.trend.ADXIndicator(df['high'], df['low'], df['close'], window=14)
    df['adx'] = adx_ind.adx()
    
    df.dropna(inplace=True)
    
    def simulate(strategy_name, logic_func):
        balance = 1000
        wins, losses = 0, 0
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        atrs = df['atr'].values
        
        signals = logic_func(df)
        signal_indices = np.where(signals.notna())[0]
        
        for idx in signal_indices:
            dir = signals.iloc[idx]
            entry = closes[idx]
            atr = atrs[idx]
            sl = entry - (atr * 1.5) if dir == "LONG" else entry + (atr * 1.5)
            tp = entry + (atr * 3.0) if dir == "LONG" else entry - (atr * 3.0)
                
            for j in range(idx + 1, len(closes)):
                h, l = highs[j], lows[j]
                if dir == "LONG":
                    if l <= sl: losses += 1; balance -= 10; break
                    if h >= tp: wins += 1; balance += 20; break
                else:
                    if h >= sl: losses += 1; balance -= 10; break
                    if l <= tp: wins += 1; balance += 20; break

        total = wins + losses
        wr = (wins / total * 100) if total > 0 else 0
        print(f"[{strategy_name}] W: {wins} | L: {losses} | WinRate: {wr:.1f}% | Balance: ${balance:.2f}")

    def curr_strat(data):
        sig = pd.Series(index=data.index, dtype=object)
        cond_long = (data['adx'] > 25) & (data['adx'] > data['adx'].shift(1)) & (data['close'] > data['ema_200']) & (data['low'] <= data['ema_21']) & (data['close'] > data['open'])
        cond_short = (data['adx'] > 25) & (data['adx'] > data['adx'].shift(1)) & (data['close'] < data['ema_200']) & (data['high'] >= data['ema_21']) & (data['close'] < data['open'])
        sig[cond_long] = "LONG"
        sig[cond_short] = "SHORT"
        return sig

    simulate("Estrategia Actual (Pullback EMA21 + Pendiente ADX)", curr_strat)

if __name__ == "__main__":
    run_backtest()
