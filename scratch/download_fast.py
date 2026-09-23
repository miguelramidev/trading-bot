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
        url = f"https://data.binance.vision/data/futures/um/monthly/fundingRate/{symbol}/{symbol}-fundingRate-{month_str}.zip"
        
    try:
        async with session.get(url) as response:
            if response.status == 200:
                content = await response.read()
                with zipfile.ZipFile(io.BytesIO(content)) as z:
                    csv_filename = z.namelist()[0]
                    with z.open(csv_filename) as f:
                        df = pd.read_csv(f, header=None)
                        if dtype == "klines":
                            if df.iloc[0, 0] == 'open_time': df = df.iloc[1:]
                            df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignore']
                            df['open_time'] = pd.to_numeric(df['open_time'])
                            df['close'] = pd.to_numeric(df['close'])
                            df['high'] = pd.to_numeric(df['high'])
                            df['low'] = pd.to_numeric(df['low'])
                        else:
                            if 'calc_time' in str(df.iloc[0, 0]): df = df.iloc[1:]
                            df.columns = ['calc_time', 'funding_rate', 'symbol']
                            df['calc_time'] = pd.to_numeric(df['calc_time'])
                            df['funding_rate'] = pd.to_numeric(df['funding_rate'])
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
            tasks.append(fetch_and_extract(session, symbol, "15m", m, "klines"))
            tasks.append(fetch_and_extract(session, symbol, "15m", m, "funding"))
            current += relativedelta(months=1)
            
        results = await asyncio.gather(*tasks)
        
        # Split results
        klines = [r for i, r in enumerate(results) if i % 2 == 0 and r is not None]
        fundings = [r for i, r in enumerate(results) if i % 2 != 0 and r is not None]
        
        if klines:
            df = pd.concat(klines, ignore_index=True)
            df['datetime'] = pd.to_datetime(df['open_time'], unit='ms')
            df.sort_values('open_time', inplace=True)
            df.to_csv(f"data_dl/{symbol}_15m.csv", index=False)
            print(f"✅ {symbol} Klines: {len(df)}")
            
        if fundings:
            df_f = pd.concat(fundings, ignore_index=True)
            df_f['datetime'] = pd.to_datetime(df_f['calc_time'], unit='ms')
            df_f.sort_values('calc_time', inplace=True)
            df_f.to_csv(f"data_dl/{symbol}_funding.csv", index=False)
            print(f"✅ {symbol} Funding: {len(df_f)}")

async def main():
    os.makedirs("data_dl", exist_ok=True)
    coins = ["ETHUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "AVAXUSDT", "DOGEUSDT", "LINKUSDT", "MATICUSDT", "DOTUSDT", "BNBUSDT"]
    start = date(2023, 1, 1)
    end = date(2026, 8, 1)
    
    # Run sequentially by coin to not overload completely
    for c in coins:
        await download_symbol(c, start, end)

if __name__ == "__main__":
    asyncio.run(main())
