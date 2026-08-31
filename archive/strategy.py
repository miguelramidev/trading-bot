import pandas as pd
import numpy as np

class PullbackStrategy:
    def __init__(self, risk_reward_ratio=3.0, sl_percent=1.5, max_distance_percent=5.0):
        self.rr_ratio = risk_reward_ratio
        self.sl_percent = sl_percent / 100.0  # 1.5% stop loss by default
        self.max_distance_percent = max_distance_percent / 100.0 # Only consider if current price is within 5% of support

    def analyze(self, df):
        """
        Analyzes a dataframe to find the best support pullback setup.
        Returns a dictionary with trade details or None if no valid setup.
        """
        if df is None or len(df) < 10:
            return None

        # Identify Swing Lows (Support)
        # A simple swing low is when a low is lower than the previous and next lows
        df['swing_low'] = (df['low'] < df['low'].shift(1)) & (df['low'] < df['low'].shift(-1))
        
        supports = df[df['swing_low']]
        if supports.empty:
            return None
        
        # Get the most recent significant support (we can look at the last few swing lows)
        # Let's just take the lowest low of the last 20 candles (excluding the current unclosed candle)
        recent_df = df.iloc[-25:-1]  # Exclude current forming candle
        if recent_df.empty:
            return None
            
        support_level = recent_df['low'].min()
        
        current_price = df['close'].iloc[-1]
        
        # We only want to place limit orders if the price is ABOVE the support
        if current_price <= support_level:
            return None
            
        # Calculate distance to support
        distance_to_support = (current_price - support_level) / support_level
        
        # If the price is too far away from the support, it's not a relevant setup for now
        if distance_to_support > self.max_distance_percent:
            return None
            
        # Calculate Trade Parameters
        entry_price = support_level * 1.001  # Add a tiny 0.1% buffer to ensure fill
        stop_loss = entry_price * (1 - self.sl_percent)
        risk_per_coin = entry_price - stop_loss
        take_profit = entry_price + (risk_per_coin * self.rr_ratio)
        
        # Score the setup: The closer we are to the support, the better the score (lower distance is better)
        # So we can use (max_distance_percent - distance_to_support) as a score
        score = self.max_distance_percent - distance_to_support
        
        return {
            'support_level': support_level,
            'current_price': current_price,
            'entry': entry_price,
            'stop_loss': stop_loss,
            'take_profit': take_profit,
            'distance_pct': distance_to_support * 100,
            'score': score
        }

    def run_competition(self, fetcher, symbols, timeframe):
        """
        Runs the strategy on a list of symbols and returns the best one.
        """
        best_signal = None
        best_score = -1
        
        for symbol in symbols:
            df = fetcher.fetch_ohlcv(symbol, timeframe, limit=50)
            if df is not None:
                signal = self.analyze(df)
                if signal:
                    if signal['score'] > best_score:
                        best_score = signal['score']
                        signal['symbol'] = symbol
                        best_signal = signal
                        
        return best_signal
