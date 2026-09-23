import os
import requests
import zipfile
import io
import pandas as pd
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

def download_data(symbol, timeframe, start_date, end_date):
    os.makedirs("data_dl", exist_ok=True)
    base_url = "https://data.binance.vision/data/futures/um/monthly/klines"
    current_date = start_date
    all_data = []

    print(f"Descargando klines {symbol} desde {start_date} hasta {end_date}...")
    while current_date <= end_date:
        month_str = current_date.strftime('%Y-%m')
        file_name = f"{symbol}-{timeframe}-{month_str}.zip"
        url = f"{base_url}/{symbol}/{timeframe}/{file_name}"
        
        response = requests.get(url)
        if response.status_code == 200:
            with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                csv_filename = z.namelist()[0]
                with z.open(csv_filename) as f:
                    df = pd.read_csv(f, header=None)
                    if df.iloc[0, 0] == 'open_time': df = df.iloc[1:]
                    df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignore']
                    all_data.append(df)
        current_date += relativedelta(months=1)

    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df['open_time'] = pd.to_numeric(final_df['open_time'])
        final_df['close'] = pd.to_numeric(final_df['close'])
        final_df['high'] = pd.to_numeric(final_df['high'])
        final_df['low'] = pd.to_numeric(final_df['low'])
        final_df['datetime'] = pd.to_datetime(final_df['open_time'], unit='ms')
        final_df.sort_values('open_time', inplace=True)
        out = f"data_dl/{symbol}_{timeframe}.csv"
        final_df.to_csv(out, index=False)
        print(f"✅ Guardado {len(final_df)} velas en {out}")

def download_funding(symbol, start_date, end_date):
    os.makedirs("data_dl", exist_ok=True)
    base_url = "https://data.binance.vision/data/futures/um/monthly/fundingRate"
    current_date = start_date
    all_data = []

    print(f"Descargando Funding {symbol}...")
    while current_date <= end_date:
        month_str = current_date.strftime('%Y-%m')
        file_name = f"{symbol}-fundingRate-{month_str}.zip"
        url = f"{base_url}/{symbol}/{file_name}"
        
        response = requests.get(url)
        if response.status_code == 200:
            with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                csv_filename = z.namelist()[0]
                with z.open(csv_filename) as f:
                    df = pd.read_csv(f, header=None)
                    # format: calc_time, funding_rate, symbol
                    if 'calc_time' in str(df.iloc[0, 0]): df = df.iloc[1:]
                    df.columns = ['calc_time', 'funding_rate', 'symbol']
                    all_data.append(df)
        current_date += relativedelta(months=1)

    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df['calc_time'] = pd.to_numeric(final_df['calc_time'])
        final_df['funding_rate'] = pd.to_numeric(final_df['funding_rate'])
        final_df['datetime'] = pd.to_datetime(final_df['calc_time'], unit='ms')
        final_df.sort_values('calc_time', inplace=True)
        out = f"data_dl/{symbol}_funding.csv"
        final_df.to_csv(out, index=False)
        print(f"✅ Guardado {len(final_df)} funding rates en {out}")

if __name__ == "__main__":
    start = date(2023, 1, 1)
    end = date(2026, 8, 1)
    download_data("BTCUSDT", "15m", start, end)
    download_funding("BTCUSDT", start, end)
