import ccxt
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('DataFetcher')

class DataFetcher:
    def __init__(self):
        # We use Binance. Spot market.
        self.exchange = ccxt.binance({
            'enableRateLimit': True,
        })
        self.excluded_coins = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT']
    
    def get_top_100_pairs(self):
        """
        Fetches all tickers, filters for USDT pairs, excludes specific coins,
        and returns the top 100 pairs sorted by 24h quote volume as a proxy for liquidity/market cap.
        """
        try:
            tickers = self.exchange.fetch_tickers()
            usdt_pairs = []
            
            for symbol, ticker in tickers.items():
                if symbol.endswith('/USDT') and symbol not in self.excluded_coins:
                    # Ignore leveraged tokens (UP/DOWN/BULL/BEAR)
                    if any(x in symbol for x in ['UP/USDT', 'DOWN/USDT', 'BULL/USDT', 'BEAR/USDT']):
                        continue
                    
                    quote_volume = ticker.get('quoteVolume', 0)
                    if quote_volume is not None and quote_volume > 0:
                        usdt_pairs.append({
                            'symbol': symbol,
                            'quoteVolume': quote_volume
                        })
            
            # Sort by quote volume descending
            usdt_pairs.sort(key=lambda x: x['quoteVolume'], reverse=True)
            
            # Get top 100 symbols
            top_100 = [pair['symbol'] for pair in usdt_pairs[:100]]
            return top_100
        except Exception as e:
            logger.error(f"Error fetching top 100 pairs: {e}")
            return []

    def fetch_ohlcv(self, symbol, timeframe='1h', limit=100):
        """
        Fetches OHLCV data for a given symbol and timeframe.
        Returns a pandas DataFrame.
        """
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit)
            df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
            return df
        except Exception as e:
            logger.error(f"Error fetching OHLCV for {symbol}: {e}")
            return None

if __name__ == "__main__":
    fetcher = DataFetcher()
    top_pairs = fetcher.get_top_100_pairs()
    print(f"Top 10 pairs: {top_pairs[:10]}")
    if top_pairs:
        df = fetcher.fetch_ohlcv(top_pairs[0], '1h', 5)
        print(df)
