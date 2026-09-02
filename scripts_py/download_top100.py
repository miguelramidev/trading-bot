import os
import requests
import zipfile
import io
import pandas as pd
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import ccxt
import time

def get_top_100_symbols():
    print("Consultando el Top 100 de Binance Futures por volumen...")
    exchange = ccxt.binance({'options': {'defaultType': 'future'}})
    exchange.load_markets()
    tickers = exchange.fetch_tickers()
    
    # Filtrar solo USDT perpetuos
    usdt_pairs = []
    for symbol, ticker in tickers.items():
        if symbol.endswith('/USDT:USDT'):
            usdt_pairs.append({
                'symbol': symbol,
                'clean_symbol': symbol.replace('/', '').replace(':USDT', ''),
                'quoteVolume': ticker.get('quoteVolume', 0)
            })
            
    # Ordenar por volumen y tomar los 100 primeros
    usdt_pairs.sort(key=lambda x: x['quoteVolume'], reverse=True)
    top_100 = usdt_pairs[:100]
    
    print(f"Top 5 encontrados: {[x['clean_symbol'] for x in top_100[:5]]}")
    return [x['clean_symbol'] for x in top_100]

def download_binance_monthly_klines(symbol, timeframe, start_date, end_date, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{symbol}_{timeframe}_historical.csv")
    
    if os.path.exists(out_path):
        print(f"[{symbol}] Ya existe el archivo histórico, saltando descarga.")
        return out_path
        
    base_url = "https://data.binance.vision/data/futures/um/monthly/klines"
    current_date = start_date
    all_data = []

    clean_sym = symbol.encode('ascii', 'ignore').decode()
    print(f"[{clean_sym}] Descargando datos...")

    while current_date <= end_date:
        month_str = current_date.strftime('%Y-%m')
        file_name = f"{symbol}-{timeframe}-{month_str}.zip"
        url = f"{base_url}/{symbol}/{timeframe}/{file_name}"
        
        response = requests.get(url)
        
        if response.status_code == 200:
            try:
                with zipfile.ZipFile(io.BytesIO(response.content)) as z:
                    csv_filename = z.namelist()[0]
                    with z.open(csv_filename) as f:
                        df = pd.read_csv(f, header=None)
                        if str(df.iloc[0, 0]) == 'open_time':
                            df = df.iloc[1:].reset_index(drop=True)
                        df.columns = ['open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_asset_volume', 'trades', 'taker_buy_base', 'taker_buy_quote', 'ignore']
                        df['open_time'] = pd.to_numeric(df['open_time'])
                        all_data.append(df)
            except Exception as e:
                pass # Ignorar errores de parseo menores
        
        current_date += relativedelta(months=1)

    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df['datetime'] = pd.to_datetime(final_df['open_time'], unit='ms')
        final_df.set_index('datetime', inplace=True)
        final_df.sort_index(inplace=True)
        
        final_df.to_csv(out_path)
        print(f"[{clean_sym}] Guardado exitosamente.")
        return out_path
    else:
        print(f"[{clean_sym}] No se encontraron datos.")
        return None

if __name__ == "__main__":
    symbols = get_top_100_symbols()
    timeframe = "1h"
    start_date = date(2023, 1, 1)
    end_date = date(2026, 8, 1)
    output_dir = "data/history"
    
    # Download top 10 as a proof of concept first to not block for 2 hours,
    # wait, user asked for complete process. I will loop all 100.
    for i, sym in enumerate(symbols):
        print(f"Progreso: {i+1}/100")
        download_binance_monthly_klines(sym, timeframe, start_date, end_date, output_dir)
