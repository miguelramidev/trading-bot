import os
import requests
import zipfile
import io
import pandas as pd
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

def download_binance_monthly_klines(symbol, timeframe, start_date, end_date, output_dir):
    """
    Descarga klines mensuales desde Binance Vision (data.binance.vision).
    """
    os.makedirs(output_dir, exist_ok=True)
    base_url = "https://data.binance.vision/data/futures/um/monthly/klines"
    
    current_date = start_date
    all_data = []

    print(f"Descargando datos para {symbol} desde {start_date.strftime('%Y-%m')} hasta {end_date.strftime('%Y-%m')}...")

    while current_date <= end_date:
        month_str = current_date.strftime('%Y-%m')
        # Formato: BTCUSDT-1h-2023-01.zip
        file_name = f"{symbol}-{timeframe}-{month_str}.zip"
        url = f"{base_url}/{symbol}/{timeframe}/{file_name}"
        
        print(f"Fetching {url}...")
        response = requests.get(url)
        
        if response.status_code == 200:
            try:
                # Read zip file from memory
                with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                    csv_filename = z.namelist()[0]
                    with z.open(csv_filename) as f:
                        # Binance klines format: 
                        # open_time, open, high, low, close, volume, close_time, quote_asset_volume, number_of_trades, taker_buy_base_asset_volume, taker_buy_quote_asset_volume, ignore
                        # Some files have a header, some don't.
                        # We read it, and if the first column is 'open_time', we drop the first row.
                        df = pd.read_csv(f, header=None)
                        if df.iloc[0, 0] == 'open_time':
                            df = df.iloc[1:].reset_index(drop=True)
                        df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignore']
                        # Convert to numeric to be safe
                        df['open_time'] = pd.to_numeric(df['open_time'])
                        all_data.append(df)
            except Exception as e:
                print(f"Error parseando {file_name}: {e}")
        else:
            print(f"No se encontró el mes {month_str} (Status: {response.status_code})")
        
        current_date += relativedelta(months=1)

    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df['datetime'] = pd.to_datetime(final_df['open_time'], unit='ms')
        final_df.set_index('datetime', inplace=True)
        final_df.sort_index(inplace=True)
        
        # Save to feather or csv for quick loading
        out_path = os.path.join(output_dir, f"{symbol}_{timeframe}_historical.csv")
        final_df.to_csv(out_path)
        print(f"Guardado {len(final_df)} registros en {out_path}")
        return out_path
    else:
        print("No se descargó ningún dato.")
        return None

if __name__ == "__main__":
    # Parametros para la línea base
    symbol = "BTCUSDT"
    timeframe = "1h"
    start_date = date(2023, 1, 1) # ~3.5 años de data
    end_date = date(2026, 8, 1)
    output_dir = "data/history"
    
    download_binance_monthly_klines(symbol, timeframe, start_date, end_date, output_dir)
