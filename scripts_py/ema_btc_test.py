import backtrader as bt
import pandas as pd
import datetime

class EMATrendFollowing(bt.Strategy):
    params = (
        ('ema_fast', 20),
        ('ema_slow', 50),
        ('ema_regime', 200),
        ('atr_period', 14),
        ('atr_multiplier', 3.0),
        ('risk_per_trade', 0.015), # 1.5% del capital
    )

    def __init__(self):
        self.fast = bt.indicators.EMA(self.data.close, period=self.p.ema_fast)
        self.slow = bt.indicators.EMA(self.data.close, period=self.p.ema_slow)
        self.regime = bt.indicators.EMA(self.data.close, period=self.p.ema_regime)
        self.atr = bt.indicators.ATR(self.data, period=self.p.atr_period)
        
        self.crossover = bt.indicators.CrossOver(self.fast, self.slow)
        
        self.stop_price = None

    def next(self):
        # 1. Filtro de Horario (UTC a PYT: PYT = UTC - 4 horas en promedio)
        # Nota: Simplificamos usando UTC-4 para todo el año en el backtest
        dt_utc = self.data.datetime.datetime(0)
        dt_pyt = dt_utc - datetime.timedelta(hours=4)
        
        # Horario permitido: 08:30 a 23:00
        is_awake = False
        if dt_pyt.hour >= 8 and dt_pyt.hour < 23:
            is_awake = True
            if dt_pyt.hour == 8 and dt_pyt.minute < 30:
                is_awake = False

        # 2. Lógica de Salida (Trailing Stop Loss)
        if self.position:
            # Calcular el nuevo stop dinámico
            new_stop = self.data.close[0] - (self.atr[0] * self.p.atr_multiplier)
            
            # El Trailing Stop solo puede subir, nunca bajar
            if self.stop_price is None or new_stop > self.stop_price:
                self.stop_price = new_stop
                
            # Verificar si el precio tocó el stop loss
            if self.data.close[0] <= self.stop_price:
                self.close()
                self.stop_price = None
            return # Si estamos en posición, no abrimos más (estamos testeando un solo activo)

        # 3. Lógica de Entrada
        if not self.position and is_awake:
            # Filtro de régimen: Precio por encima de EMA 200
            if self.data.close[0] > self.regime[0]:
                # Gatillo: Cruce hacia arriba
                if self.crossover[0] > 0:
                    # Tamaño de posición basado en riesgo
                    cash = self.broker.get_cash()
                    risk_amount = cash * self.p.risk_per_trade
                    stop_distance = self.atr[0] * self.p.atr_multiplier
                    
                    if stop_distance > 0:
                        size = risk_amount / stop_distance
                        
                        # Limitar el tamaño a no exceder el capital (apalancamiento 1x máximo)
                        max_size = (cash * 0.99) / self.data.close[0]
                        size = min(size, max_size)
                        
                        self.buy(size=size)
                        self.stop_price = self.data.close[0] - stop_distance

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

def run_strategy():
    print("Ejecutando backtest de Estrategia EMA sobre BTCUSDT...")
    df = pd.read_csv('data/history/BTCUSDT_1h_historical.csv', index_col='datetime', parse_dates=True)
    
    cerebro = bt.Cerebro()
    cerebro.addstrategy(EMATrendFollowing)
    
    data = PandasData_Binance(dataname=df)
    cerebro.adddata(data)
    
    cerebro.broker.setcash(10000.0)
    cerebro.broker.setcommission(commission=0.0005) # 0.05% Taker
    
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    
    results = cerebro.run()
    strat = results[0]
    
    trades = strat.analyzers.trades.get_analysis()
    
    print('-'*50)
    print('Estrategia: EMA Trend Following (Solo BTC)')
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
    run_strategy()
