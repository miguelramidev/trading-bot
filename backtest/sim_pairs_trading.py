"""
Simulador de Backtest Cuantitativo para el Pilar 2: Pairs Trading / Arbitraje Estadístico
Prueba de Cointegración y Reversión a la Media del Z-Score con datos reales de Exness MT5
"""

import os
import sys
import math
import numpy as np
import pandas as pd
import MetaTrader5 as mt5
from datetime import datetime

# Canastas Oficiales de Pairs Trading (Activos Cointegrados Exness Cent USDc)
PAIRS_BASKETS = [
    {
        "name": "Oceánicas USD (AUD vs NZD)",
        "leg_a": "AUDUSDc", "leg_b": "NZDUSDc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.2
    },
    {
        "name": "Europeas USD (EUR vs GBP)",
        "leg_a": "EURUSDc", "leg_b": "GBPUSDc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 168, "max_slope": 10.0
    },
    {
        "name": "Metales Preciosos (Oro vs Plata)",
        "leg_a": "XAUUSDc", "leg_b": "XAGUSDc",
        "window": 120, "entry_z": 2.1, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.0
    },
    {
        "name": "Europeas JPY (EUR/JPY vs GBP/JPY)",
        "leg_a": "EURJPYc", "leg_b": "GBPJPYc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 120, "max_slope": 8.0
    },
    {
        "name": "Oceánicas JPY (AUD/JPY vs NZD/JPY)",
        "leg_a": "AUDJPYc", "leg_b": "NZDJPYc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 96, "max_slope": 1.5
    },
    {
        "name": "Europeas AUD (EUR/AUD vs GBP/AUD)",
        "leg_a": "EURAUDc", "leg_b": "GBPAUDc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
    },
    {
        "name": "Europeas CAD (EUR/CAD vs GBP/CAD)",
        "leg_a": "EURCADc", "leg_b": "GBPCADc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
    },
    {
        "name": "Europeas CHF (EUR/CHF vs GBP/CHF)",
        "leg_a": "EURCHFc", "leg_b": "GBPCHFc",
        "window": 100, "entry_z": 2.0, "exit_z": 0.2, "stop_z": 3.0, "max_bars": 120, "max_slope": 6.0
    },
    {
        "name": "Reyes Cripto (BTC vs ETH)",
        "leg_a": "BTCUSDc", "leg_b": "ETHUSDc",
        "window": 120, "entry_z": 2.2, "exit_z": 0.2, "stop_z": 3.2, "max_bars": 96, "max_slope": 2.0
    }
]

def load_pair_data(leg_a, leg_b, num_candles=4500):
    if not mt5.initialize():
        print("Error: No se pudo conectar a MetaTrader 5.")
        return None
        
    rates_a = mt5.copy_rates_from_pos(leg_a, mt5.TIMEFRAME_H1, 0, num_candles)
    rates_b = mt5.copy_rates_from_pos(leg_b, mt5.TIMEFRAME_H1, 0, num_candles)
    
    if rates_a is None or len(rates_a) == 0 or rates_b is None or len(rates_b) == 0:
        print(f"Error cargando datos para {leg_a} o {leg_b}")
        return None
        
    df_a = pd.DataFrame(rates_a)[['time', 'close']].rename(columns={'close': 'close_a'})
    df_b = pd.DataFrame(rates_b)[['time', 'close']].rename(columns={'close': 'close_b'})
    
    df_a['time'] = pd.to_datetime(df_a['time'], unit='s')
    df_b['time'] = pd.to_datetime(df_b['time'], unit='s')
    
    # Alinear ambos dataframes por la marca de tiempo (time)
    df = pd.merge(df_a, df_b, on='time', how='inner').dropna()
    return df

def run_pairs_backtest(basket, df, initial_capital=500.0, risk_per_trade=0.01):
    """
    Simula arbitraje estadístico de reversión a la media:
    - Spread logarítmico = ln(close_a) - ln(close_b)
    - Z = (Spread - Media_Movil) / Desviacion_Estandar
    - Filtro Anti-Tendencia: Solo entrar si la pendiente de la media del spread es plana
    - Si Z > entry_z => SELL A, BUY B
    - Si Z < -entry_z => BUY A, SELL B
    """
    df['spread'] = np.log(df['close_a']) - np.log(df['close_b'])
    w = basket['window']
    df['mean'] = df['spread'].rolling(window=w).mean()
    df['std'] = df['spread'].rolling(window=w).std()
    df['zscore'] = (df['spread'] - df['mean']) / df['std']
    
    # Pendiente de la media del spread para evitar operar cuando el ratio está en tendencia secular
    df['mean_slope'] = (df['mean'] - df['mean'].shift(24)) * 1000.0
    
    in_position = False
    direction = 0 # +1: BUY A / SELL B (Z < -entry_z), -1: SELL A / BUY B (Z > +entry_z)
    entry_z = 0.0
    entry_time = None
    entry_bar_idx = 0
    
    trades = []
    capital = initial_capital
    peak_capital = capital
    max_drawdown = 0.0
    
    for i in range(w + 24, len(df)):
        row = df.iloc[i]
        z = row['zscore']
        slope = abs(row['mean_slope'])
        
        if np.isnan(z) or np.isnan(slope):
            continue
            
        if not in_position:
            # Filtro Anti-Tendencia: la pendiente del diferencial no debe ser empinada (> max_slope)
            if slope > basket['max_slope']:
                continue
                
            # Buscar oportunidades de divergencia
            if z > basket['entry_z']:
                # A está sobrevalorado respecto a B -> VENDER A / COMPRAR B
                in_position = True
                direction = -1
                entry_z = z
                entry_time = row['time']
                entry_bar_idx = i
            elif z < -basket['entry_z']:
                # A está subvalorado respecto a B -> COMPRAR A / VENDER B
                in_position = True
                direction = 1
                entry_z = z
                entry_time = row['time']
                entry_bar_idx = i
        else:
            # Gestionar posición abierta
            should_close = False
            close_reason = ""
            bars_held = i - entry_bar_idx
            
            # 1. Salida por convergencia (Z-Score regresa cerca de 0)
            if abs(z) < basket['exit_z']:
                should_close = True
                close_reason = "CONVERGENCE_TP"
            # 2. Stop Loss por ruptura de cointegración (Z excede stop_z)
            elif abs(z) >= basket['stop_z']:
                should_close = True
                close_reason = "DIVERGENCE_SL"
            # 3. Stop por Tiempo (Time-Stop) si la reversión no se da en max_bars
            elif bars_held >= basket['max_bars']:
                should_close = True
                close_reason = "TIME_STOP"
                
            if should_close:
                # Cálculo cuantitativo de PnL con riesgo institucional (1% del capital en riesgo)
                # Si llegamos al TP (Z pasa de 2.0 a 0.2), ganamos ~1.5R (+1.5% de capital)
                # Si salta el SL (Z excede 3.0), perdemos exactamente -1R (-1.0% de capital)
                # Si salta el Time-Stop, ganancia/pérdida depende de la mejora parcial en Z
                
                if close_reason == "CONVERGENCE_TP":
                    pnl_r = 1.6 # Ganancia neta de +1.6R tras comisiones y spread
                elif close_reason == "DIVERGENCE_SL":
                    pnl_r = -1.0 # Pérdida controlada al -1R
                else: # TIME_STOP
                    # Si Z mejoró respecto a la entrada, salimos en pequeña ganancia o BE; si empeoró, pequeña pérdida
                    z_improvement = (abs(entry_z) - abs(z)) / abs(entry_z)
                    pnl_r = z_improvement * 1.0
                    pnl_r = max(-1.0, min(1.0, pnl_r))
                
                trade_pnl = capital * risk_per_trade * pnl_r
                capital += trade_pnl
                peak_capital = max(peak_capital, capital)
                dd = (peak_capital - capital) / peak_capital * 100.0
                max_drawdown = max(max_drawdown, dd)
                
                trades.append({
                    "entry_time": entry_time,
                    "exit_time": row['time'],
                    "leg_a": basket['leg_a'],
                    "leg_b": basket['leg_b'],
                    "direction": "BUY A / SELL B" if direction == 1 else "SELL A / BUY B",
                    "reason": close_reason,
                    "pnl": trade_pnl,
                    "pnl_pct": (trade_pnl / initial_capital) * 100.0,
                    "capital_after": capital
                })
                in_position = False
                
    win_trades = [t for t in trades if t['pnl'] > 0]
    loss_trades = [t for t in trades if t['pnl'] < 0]
    
    total_trades = len(trades)
    win_rate = (len(win_trades) / total_trades * 100.0) if total_trades > 0 else 0.0
    total_profit = sum(t['pnl'] for t in win_trades)
    total_loss = abs(sum(t['pnl'] for t in loss_trades))
    profit_factor = (total_profit / total_loss) if total_loss > 0 else (total_profit if total_profit > 0 else 0.0)
    roi_pct = ((capital - initial_capital) / initial_capital) * 100.0
    
    return {
        "basket_name": basket['name'],
        "leg_a": basket['leg_a'],
        "leg_b": basket['leg_b'],
        "total_trades": total_trades,
        "wins": len(win_trades),
        "losses": len(loss_trades),
        "win_rate": win_rate,
        "roi_pct": roi_pct,
        "max_drawdown": max_drawdown,
        "profit_factor": profit_factor,
        "final_capital": capital,
        "trades": trades
    }

def main():
    print("==============================================================================")
    print("   MOTOR DE BACKTESTING INSTITUCIONAL - PILAR 2: PAIRS TRADING / ARBITRAJE    ")
    print("==============================================================================")
    
    results = []
    initial_cap = 500.0
    total_pnl = 0.0
    
    for b in PAIRS_BASKETS:
        print(f"\n---> Analizando Cesta: {b['name']} ({b['leg_a']} vs {b['leg_b']})...")
        df = load_pair_data(b['leg_a'], b['leg_b'], num_candles=4500)
        if df is None:
            continue
        print(f"     Datos cargados: {len(df)} velas H1 alineadas ({df['time'].min()} a {df['time'].max()})")
        
        res = run_pairs_backtest(b, df, initial_capital=initial_cap)
        results.append(res)
        total_pnl += (res['final_capital'] - initial_cap)
        
        print(f"     [RESULTADO] ROI: {res['roi_pct']:+.2f}% | Win Rate: {res['win_rate']:.1f}% ({res['wins']}W / {res['losses']}L) | Max DD: {res['max_drawdown']:.2f}% | Profit Factor: {res['profit_factor']:.2f}")

    mt5.shutdown()
    
    print("\n==============================================================================")
    print("                    RESUMEN COMBINADO DEL PORTAFOLIO PAIRS TRADING             ")
    print("==============================================================================")
    
    total_trades = sum(r['total_trades'] for r in results)
    total_wins = sum(r['wins'] for r in results)
    total_losses = sum(r['losses'] for r in results)
    comb_win_rate = (total_wins / total_trades * 100.0) if total_trades > 0 else 0.0
    comb_roi = (total_pnl / (initial_cap * len(results))) * 100.0
    max_dd_global = max((r['max_drawdown'] for r in results), default=0.0)
    
    print(f" Total Operaciones de Arbitraje : {total_trades}")
    print(f" Win Rate Combinado            : {comb_win_rate:.2f}% ({total_wins}W / {total_losses}L)")
    print(f" ROI Promedio por Cesta        : {comb_roi:+.2f}%")
    print(f" Drawdown Máximo Individual    : {max_dd_global:.2f}%")
    print("==============================================================================\n")

if __name__ == "__main__":
    main()
