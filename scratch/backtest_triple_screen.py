import pandas as pd
import numpy as np
import ta
import os

def run_triple_screen_backtest():
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    
    portfolio_stats = {
        "Elder_Triple_Screen": {"W": 0, "L": 0, "Bal": 0}
    }
    
    print("Iniciando simulación de Triple Pantalla (Alexander Elder) en 1H...")
    
    for coin in coins:
        if not os.path.exists(f"data_dl/{coin}_1h.csv"):
            continue
            
        print(f"Procesando {coin}...")
        df = pd.read_csv(f"data_dl/{coin}_1h.csv")
        df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
        df.set_index('datetime', inplace=True)
        df.sort_index(inplace=True)
        
        # PANTALLA 1: TENDENCIA MACRO (Aproximando 4H en datos de 1H)
        # EMA 13 en 4H = EMA 52 en 1H
        df['ema_macro'] = ta.trend.ema_indicator(df['close'], window=52)
        # MACD (12, 26, 9) en 4H = MACD (48, 104, 36) en 1H
        macd_macro = ta.trend.MACD(df['close'], window_fast=48, window_slow=104, window_sign=36)
        df['macd_hist_macro'] = macd_macro.macd_diff()
        
        # PANTALLA 2: ONDAS/PULLBACKS EN EL TIEMPO INTERMEDIO (1H)
        # Oscilador Estocástico (14, 3) o RSI. Elder usa mucho Force Index o Stochastic.
        stoch = ta.momentum.StochasticOscillator(df['high'], df['low'], df['close'], window=14, smooth_window=3)
        df['stoch_k'] = stoch.stoch()
        df['stoch_d'] = stoch.stoch_signal()
        
        # ATR para TP/SL si queremos usar proporciones fijas, pero Elder usa SL en el mínimo del pullback
        df['atr'] = ta.volatility.average_true_range(df['high'], df['low'], df['close'], window=14)
        
        df.dropna(inplace=True)
        
        wins, losses, bal = 0, 0, 0
        
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        opens = df['open'].values
        atrs = df['atr'].values
        
        ema_macros = df['ema_macro'].values
        macd_hists = df['macd_hist_macro'].values
        stoch_ks = df['stoch_k'].values
        
        # Recorremos el histórico
        in_trade = False
        dir = None
        entry = 0
        sl = 0
        tp = 0
        
        for i in range(2, len(df) - 1):
            if in_trade:
                # Comprobamos hit de SL o TP en la vela i
                h, l = highs[i], lows[i]
                if dir == "LONG":
                    if l <= sl:
                        losses += 1
                        bal -= 10
                        in_trade = False
                    elif h >= tp:
                        wins += 1
                        bal += 20
                        in_trade = False
                elif dir == "SHORT":
                    if h >= sl:
                        losses += 1
                        bal -= 10
                        in_trade = False
                    elif l <= tp:
                        wins += 1
                        bal += 20
                        in_trade = False
                continue
                
            # No estamos en trade. Buscamos setup de TRIPLE PANTALLA
            
            # PANTALLA 1 (4H): Tendencia Mayor
            macro_up = (closes[i] > ema_macros[i]) and (macd_hists[i] > macd_hists[i-1])
            macro_dn = (closes[i] < ema_macros[i]) and (macd_hists[i] < macd_hists[i-1])
            
            # PANTALLA 2 (1H): Retroceso (Estocástico)
            pullback_long = stoch_ks[i] < 30 # Sobrevendido en tendencia alcista
            pullback_short = stoch_ks[i] > 70 # Sobrecomprado en tendencia bajista
            
            if macro_up and pullback_long:
                # PANTALLA 3 (Timing): Ponemos una orden Buy-Stop 1 tick arriba del máximo de la vela actual
                buy_stop = highs[i] + (closes[i] * 0.0005) # 0.05% arriba del máximo
                
                # Simulamos la siguiente vela (i+1) para ver si activa el buy stop
                if highs[i+1] > buy_stop:
                    # Entró el trade!
                    in_trade = True
                    dir = "LONG"
                    entry = buy_stop
                    # Elder pone SL en el mínimo de la vela del pullback (o de la vela de entrada, el que sea menor)
                    sl_min = min(lows[i], lows[i+1])
                    sl = sl_min - (closes[i] * 0.001)
                    
                    # Para mantener el risk/reward 1:2 del usuario:
                    riesgo = entry - sl
                    # Si el riesgo es muy ajustado (ruido), usamos ATR
                    if riesgo < atrs[i] * 0.5:
                        sl = entry - atrs[i]
                        riesgo = atrs[i]
                        
                    tp = entry + (riesgo * 2)
                    
            elif macro_dn and pullback_short:
                # PANTALLA 3 (Timing): Sell-Stop 1 tick debajo del mínimo
                sell_stop = lows[i] - (closes[i] * 0.0005)
                
                if lows[i+1] < sell_stop:
                    in_trade = True
                    dir = "SHORT"
                    entry = sell_stop
                    
                    sl_max = max(highs[i], highs[i+1])
                    sl = sl_max + (closes[i] * 0.001)
                    riesgo = sl - entry
                    if riesgo < atrs[i] * 0.5:
                        sl = entry + atrs[i]
                        riesgo = atrs[i]
                        
                    tp = entry - (riesgo * 2)
                    
        portfolio_stats["Elder_Triple_Screen"]["W"] += wins
        portfolio_stats["Elder_Triple_Screen"]["L"] += losses
        portfolio_stats["Elder_Triple_Screen"]["Bal"] += bal

    print("\n" + "="*60)
    print(" TRIPLE PANTALLA (ALEXANDER ELDER) EN 1H - 10 MONEDAS ")
    print("="*60)
    
    for s_name, stats in portfolio_stats.items():
        total = stats["W"] + stats["L"]
        wr = (stats["W"] / total * 100) if total > 0 else 0
        bal = stats["Bal"] + 1000
        print(f"[{s_name}] Total Trades: {total} | W: {stats['W']} L: {stats['L']} | WinRate: {wr:.1f}% | Balance: ${bal:.2f} (Beneficio: ${stats['Bal']:.2f})")

if __name__ == "__main__":
    run_triple_screen_backtest()
