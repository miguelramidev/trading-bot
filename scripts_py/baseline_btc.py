import backtrader as bt
import pandas as pd
import math

class BuyAndHold(bt.Strategy):
    def start(self):
        self.val_start = self.broker.get_cash()

    def next(self):
        # Comprar en la primera vela disponible con todo el capital (menos un pequeño buffer para comisiones)
        if not self.position:
            size = math.floor((self.broker.get_cash() * 0.99) / self.data.close[0] * 1000) / 1000.0
            self.buy(size=size)

    def stop(self):
        self.roi = (self.broker.get_value() / self.val_start) - 1.0
        print('-'*50)
        print('Estrategia: Buy & Hold (BTC)')
        print(f'ROI Total: {self.roi * 100:.2f}%')

class PandasData_Binance(bt.feeds.PandasData):
    # Binance vision CSV columns: 
    # open_time, open, high, low, close, volume, close_time, quote_asset_volume, trades, taker_buy_base, taker_buy_quote, ignore
    params = (
        ('datetime', None),
        ('open', 'open'),
        ('high', 'high'),
        ('low', 'low'),
        ('close', 'close'),
        ('volume', 'volume'),
        ('openinterest', -1),
    )

def run_baseline(csv_path):
    print(f"Ejecutando backtest de Línea Base sobre {csv_path}...")
    df = pd.read_csv(csv_path, index_col='datetime', parse_dates=True)
    
    cerebro = bt.Cerebro()
    cerebro.addstrategy(BuyAndHold)
    
    data = PandasData_Binance(dataname=df)
    cerebro.adddata(data)
    
    # Capital inicial y comisiones (taker fee de Binance Futures = 0.05%)
    cerebro.broker.setcash(10000.0)
    cerebro.broker.setcommission(commission=0.0005)
    
    # Analizadores
    cerebro.addanalyzer(bt.analyzers.DrawDown, _name='drawdown')
    cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name='trades')
    
    print(f"Capital Inicial: ${cerebro.broker.getvalue():.2f}")
    results = cerebro.run()
    strat = results[0]
    
    print(f"Capital Final: ${cerebro.broker.getvalue():.2f}")
    print(f"Max Drawdown: {strat.analyzers.drawdown.get_analysis()['max']['drawdown']:.2f}%")
    print('-'*50)

if __name__ == '__main__':
    run_baseline('data/history/BTCUSDT_1h_historical.csv')
