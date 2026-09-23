import pandas as pd
import numpy as np
import ta

def run_backtest():
    df = pd.read_csv("data_dl/BTCUSDT_15m.csv")
    df_fund = pd.read_csv("data_dl/BTCUSDT_funding.csv")

    df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
    df.set_index('datetime', inplace=True)
    df.sort_index(inplace=True)
    
    df_fund['datetime'] = pd.to_datetime(df_fund['calc_time'], unit='ms')
    df_fund.set_index('datetime', inplace=True)
    df_fund.sort_index(inplace=True)
    
    df = df.join(df_fund[['funding_rate']], how='left')
    df['funding_rate'] = df['funding_rate'].ffill().fillna(0)

    df['ema_200'] = ta.trend.ema_indicator(df['close'], window=200)
    macd = ta.trend.MACD(df['close'], window_fast=12, window_slow=26, window_sign=9)
    df['macd_hist'] = macd.macd_diff()
    df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
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

    def macd_basic(data):
        sig = pd.Series(index=data.index, dtype=object)
        cond_long = (data['close'] > data['ema_200']) & (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['macd_hist'].shift(2) < 0)
        cond_short = (data['close'] < data['ema_200']) & (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['macd_hist'].shift(2) > 0)
        sig[cond_long] = "LONG"
        sig[cond_short] = "SHORT"
        return sig

    def macd_bull_funding(data):
        sig = pd.Series(index=data.index, dtype=object)
        # Only take trades if funding rate confirms the trend momentum (High funding = strong bull market, go long)
        cond_long = (data['close'] > data['ema_200']) & (data['macd_hist'] > 0) & (data['macd_hist'].shift(1) < 0) & (data['funding_rate'] > 0)
        cond_short = (data['close'] < data['ema_200']) & (data['macd_hist'] < 0) & (data['macd_hist'].shift(1) > 0) & (data['funding_rate'] <= 0)
        sig[cond_long] = "LONG"
        sig[cond_short] = "SHORT"
        return sig

    simulate("MACD Puro", macd_basic)
    simulate("MACD + Seguir Funding Rate (Bull)", macd_bull_funding)

if __name__ == "__main__":
    run_backtest()
