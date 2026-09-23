import pandas as pd
import numpy as np
import ta
import os

def run_range_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    portfolio_stats = {
        "Rango1_StochBB": {"W": 0, "L": 0, "Bal": 0},
        "Rango2_RSIMeanRev": {"W": 0, "L": 0, "Bal": 0},
        "Rango3_InsideBar": {"W": 0, "L": 0, "Bal": 0}
    }
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_15m.csv"): continue
            
        print(f"Procesando {coin} para estrategias de rango...")
        df = pd.read_csv(f"data_dl/{coin}_15m.csv")
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        # Indicators
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        adx_ind = ta.trend.ADXIndicator(df['high'], df['low'], df['close'], window=14)
        df['adx'] = adx_ind.adx()
        
        bb = ta.volatility.BollingerBands(df['close'], window=20, window_dev=2)
        df['bb_high'] = bb.bollinger_hband()
        df['bb_low'] = bb.bollinger_lband()
        df['bb_mid'] = bb.bollinger_mavg()
        
        # Stochastic
        stoch = ta.momentum.StochasticOscillator(df['high'], df['low'], df['close'], window=14, smooth_window=3)
        df['stoch_k'] = stoch.stoch()
        df['stoch_d'] = stoch.stoch_signal()
        
        # RSI
        df['rsi'] = ta.momentum.rsi(df['close'], window=14)
        
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
                # En rango, el RR suele ser 1:1 o 1:1.5. Mantengamos 1:2 para comparar peras con peras.
                # O mejor, 1:1.5 para rangos porque los recorridos son más cortos.
                # El usuario quiere "nuestros parametros", que son 1 ATR SL y 2 ATR TP.
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

        # Estrategia 1: Stochastic + Bollinger Bands
        def strat_stoch_bb(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_range = data['adx'] < 25
            
            # Long: Toca BB inferior, y el Stoch K cruza D hacia arriba desde zona de sobreventa (< 20)
            stoch_cross_up = (data['stoch_k'] > data['stoch_d']) & (data['stoch_k'].shift(1) <= data['stoch_d'].shift(1)) & (data['stoch_k'] < 25)
            bb_touch_low = data['low'] <= data['bb_low']
            
            # Short: Toca BB superior, y el Stoch K cruza D hacia abajo desde zona de sobrecompra (> 80)
            stoch_cross_down = (data['stoch_k'] < data['stoch_d']) & (data['stoch_k'].shift(1) >= data['stoch_d'].shift(1)) & (data['stoch_k'] > 75)
            bb_touch_high = data['high'] >= data['bb_high']
            
            sig[is_range & bb_touch_low & stoch_cross_up] = "LONG"
            sig[is_range & bb_touch_high & stoch_cross_down] = "SHORT"
            return sig

        # Estrategia 2: RSI Mean Reversion Extrema (Compra en pánico)
        def strat_rsi_meanrev(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_range = data['adx'] < 25
            
            # Solo entra si el RSI está exageradamente extendido y empieza a revertir
            rsi_revert_up = (data['rsi'] > data['rsi'].shift(1)) & (data['rsi'].shift(1) < 25)
            rsi_revert_down = (data['rsi'] < data['rsi'].shift(1)) & (data['rsi'].shift(1) > 75)
            
            sig[is_range & rsi_revert_up] = "LONG"
            sig[is_range & rsi_revert_down] = "SHORT"
            return sig
            
        # Estrategia 3: Bollinger Squeeze Reversion (Falso Breakout)
        def strat_fakeout(data):
            sig = pd.Series(index=data.index, dtype=object)
            is_range = data['adx'] < 25
            
            # Vela anterior rompió la banda, pero cerró dentro. La vela actual va en contra.
            fake_down = (data['low'].shift(1) < data['bb_low'].shift(1)) & (data['close'].shift(1) > data['bb_low'].shift(1)) & (data['close'] > data['open'])
            fake_up = (data['high'].shift(1) > data['bb_high'].shift(1)) & (data['close'].shift(1) < data['bb_high'].shift(1)) & (data['close'] < data['open'])
            
            sig[is_range & fake_down] = "LONG"
            sig[is_range & fake_up] = "SHORT"
            return sig

        w1, l1, b1 = run_sim(strat_stoch_bb)
        w2, l2, b2 = run_sim(strat_rsi_meanrev)
        w3, l3, b3 = run_sim(strat_fakeout)
        
        portfolio_stats["Rango1_StochBB"]["W"] += w1; portfolio_stats["Rango1_StochBB"]["L"] += l1; portfolio_stats["Rango1_StochBB"]["Bal"] += b1
        portfolio_stats["Rango2_RSIMeanRev"]["W"] += w2; portfolio_stats["Rango2_RSIMeanRev"]["L"] += l2; portfolio_stats["Rango2_RSIMeanRev"]["Bal"] += b2
        portfolio_stats["Rango3_InsideBar"]["W"] += w3;  portfolio_stats["Rango3_InsideBar"]["L"] += l3;  portfolio_stats["Rango3_InsideBar"]["Bal"] += b3

    print("\n" + "="*50)
    print(" RESULTADOS ESTRATEGIAS DE RANGO (10 MONEDAS x 3.5 AÑOS) ")
    print(" RR: 1:2 (Riesgo $10, Ganancia $20) ")
    print("="*50)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_range_backtest()
