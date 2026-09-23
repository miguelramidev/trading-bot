import asyncio
import aiohttp
import zipfile
import io
import pandas as pd
from datetime import date
from dateutil.relativedelta import relativedelta
import os

async def fetch_and_extract(session, symbol, timeframe, month_str, dtype="klines"):
    if dtype == "klines":
        url = f"https://data.binance.vision/data/futures/um/monthly/klines/{symbol}/{timeframe}/{symbol}-{timeframe}-{month_str}.zip"
    else:
        return None # Ya tenemos funding, no necesitamos bajarlo de nuevo
        
    try:
        async with session.get(url) as response:
            if response.status == 200:
                content = await response.read()
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    csv_filename = z.namelist()[0]
                    with z.open(csv_filename) as f:
                        df = pd.read_csv(f, header=None)
                        if df.iloc[0, 0] == 'open_time': df = df.iloc[1:]
                        df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignore']
                        df['open_time'] = pd.to_numeric(df['open_time'])
                        df['close'] = pd.to_numeric(df['close'])
                        df['high'] = pd.to_numeric(df['high'])
                        df['low'] = pd.to_numeric(df['low'])
                        return df
    except Exception as e:
        pass
    return None

async def download_symbol(symbol, start_date, end_date):
    async with aiohttp.ClientSession() as session:
        tasks = []
        current = start_date
        while current <= end_date:
            m = current.strftime('%Y-%m')
            tasks.append(fetch_and_extract(session, symbol, "1h", m, "klines"))
            current += relativedelta(months=1)
            
        results = await asyncio.gather(*tasks)
        klines = [r for r in results if r is not None]
        
        if klines:
            df = pd.concat(klines, ignore_index=True)
            df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
            df.sort_values('open_time', inplace=True)
            df.to_csv(f"data_dl/{symbol}_1h.csv", index=False)
            print(f"✅ {symbol} Klines (1h): {len(df)}")

async def main():
    os.makedirs("data_dl", exist_ok=True)
    coins = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    start = date(2023, 1, 1)
    end = date(2026, 8, 1)
    
    for c in coins:
        await download_symbol(c, start, end)

if __name__ == "__main__":
    asyncio.run(main())
