import backtrader as bt
import pandas as pd
import datetime
import os
import glob

class EMATrendFollowingMulti(bt.Strategy):
    params = (
        ('ema_fast', 20),
        ('ema_slow', 50),
        ('ema_regime', 200),
        ('atr_period', 14),
        ('atr_multiplier', 3.0),
        ('risk_per_trade', 0.015), # 1.5% del capital por trade
        ('max_positions', 5),      # Limite de calor del portafolio
    )

    def __init__(self):
        self.inds = {}
        for d in self.datas:
            self.inds[d] = {}
            self.inds[d]['fast'] = bt.indicators.EMA(d.close, period=self.p.ema_fast)
            self.inds[d]['slow'] = bt.indicators.EMA(d.close, period=self.p.ema_slow)
            self.inds[d]['regime'] = bt.indicators.EMA(d.close, period=self.p.ema_regime)
            self.inds[d]['atr'] = bt.indicators.ATR(d, period=self.p.atr_period)
            self.inds[d]['cross'] = bt.indicators.CrossOver(self.inds[d]['fast'], self.inds[d]['slow'])
            self.inds[d]['stop_price'] = None

    def next(self):
        # Filtro de Horario (Convertimos UTC a PYT aproximado UTC-4)
        # Tomamos el datetime del primer feed (todos están alineados)
        dt_utc = self.data0.datetime.datetime(0)
        dt_pyt = dt_utc - datetime.timedelta(hours=4)
        
        is_awake = False
        if dt_pyt.hour >= 8 and dt_pyt.hour < 23:
            is_awake = True
            if dt_pyt.hour == 8 and dt_pyt.minute < 30:
                is_awake = False

        # Contar posiciones abiertas
        open_positions = sum(1 for d in self.datas if self.getposition(d).size != 0)

        for d in self.datas:
            pos = self.getposition(d)
            
            # Lógica de Salida (Trailing Stop)
            if pos.size != 0:
                new_stop = d.close[0] - (self.inds[d]['atr'][0] * self.p.atr_multiplier)
                
                if self.inds[d]['stop_price'] is None or new_stop > self.inds[d]['stop_price']:
                    self.inds[d]['stop_price'] = new_stop
                    
                if d.close[0] <= self.inds[d]['stop_price']:
                    self.close(data=d)
                    self.inds[d]['stop_price'] = None
                    open_positions -= 1 # Liberar cupo inmediatamente
                continue # Si ya estamos en el activo, pasamos al siguiente

            # Lógica de Entrada
            if pos.size == 0 and is_awake and open_positions < self.p.max_positions:
                # Filtro de régimen
                if d.close[0] > self.inds[d]['regime'][0]:
                    # Gatillo
                    if self.inds[d]['cross'][0] > 0:
                        cash = self.broker.get_cash()
                        risk_amount = cash * self.p.risk_per_trade
                        stop_distance = self.inds[d]['atr'][0] * self.p.atr_multiplier
                        
                        if stop_distance > 0:
                            size = risk_amount / stop_distance
                            
                            # Filtro 1x (no usar margen)
                            max_size = (cash * 0.99) / d.close[0]
                            # Distribuimos equitativamente entre las max_positions
                            max_size_allowed = max_size / self.p.max_positions
                            
                            size = min(size, max_size_allowed)
                            
                            if size > 0:
                                self.buy(data=d, size=size)
                                self.inds[d]['stop_price'] = d.close[0] - stop_distance
                                open_positions += 1 # Ocupamos un cupo

    def stop(self):
        self.roi = (self.broker.get_value() / 10000.0) - 1.0

class PandasData_Binance(bt.feeds.PandasData):
    params = (
        ('datetime', None),
        ('open', 'open'),
        ('high', 'high'),
        ('low', 'low'),
        ('close', 'close'),
        ('volume', 'volume'),
        ('openinterest', -1),
    )

def run_portfolio():
    print("Inicializando Cerebro para Portafolio Top 100...")
    cerebro = bt.Cerebro()
    cerebro.addstrategy(EMATrendFollowingMulti)
    
    # Cargar todos los CSVs descargados
    csv_files = glob.glob('data/history/*_1h_historical.csv')
    if not csv_files:
        print("No se encontraron datos. Ejecuta download_top100.py primero.")
        return
        
    print(f"Cargando {len(csv_files)} activos en el simulador. Esto puede tardar unos segundos...")
    
    for f in csv_files:
        try:
            df = pd.read_csv(f, index_col='datetime', parse_dates=True)
            # Asegurar que no haya duplicados y este ordenado
            df = df[~df.index.duplicated(keep='first')].sort_index()
            data = PandasData_Binance(dataname=df, plot=False)
            cerebro.adddata(data)
        except Exception as e:
            print(f"Error cargando {f}: {e}")

    cerebro.broker.setcash(10000.0)
    cerebro.broker.setcommission(commission=0.0005) # 0.05%
    
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    
    print("Iniciando simulacion...")
    results = cerebro.run()
    strat = results[0]
    
    trades = strat.analyzers.trades.get_analysis()
    
    print('-'*50)
    print('Estrategia: EMA Trend Following (Portafolio Top 100)')
    print(f'Capital Final: ${cerebro.broker.getvalue():.2f}')
    print(f'ROI Total: {strat.roi * 100:.2f}%')
    print(f"Max Drawdown: {strat.analyzers.drawdown.get_analysis()['max']['drawdown']:.2f}%")
    
    if 'total' in trades and trades['total']['closed'] > 0:
        total_trades = trades['total']['closed']
        won = trades['won']['total']
        lost = trades['lost']['total']
        winrate = (won / total_trades) * 100
        print(f"Operaciones Cerradas: {total_trades}")
        print(f"Winrate: {winrate:.2f}% ({won} G / {lost} P)")
    print('-'*50)

if __name__ == '__main__':
    run_portfolio()
