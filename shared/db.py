import sqlite3
import os
import logging
from datetime import datetime

logger = logging.getLogger('Database')

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'trading_history.db')

def init_db():
    """Inicializa la base de datos y crea la tabla si no existe"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            direction TEXT NOT NULL,
            open_time TIMESTAMP NOT NULL,
            close_time TIMESTAMP NOT NULL,
            open_price REAL NOT NULL,
            close_price REAL NOT NULL,
            lot_size REAL NOT NULL,
            pnl_net REAL NOT NULL,
            roi_percent REAL NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Base de datos SQLite inicializada correctamente.")

def log_trade(symbol, direction, open_time, close_time, open_price, close_price, lot_size, pnl_net, roi_percent):
    """Inserta el registro de un trade cerrado en la base de datos"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO trades (
                symbol, direction, open_time, close_time, open_price, close_price, lot_size, pnl_net, roi_percent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (symbol, direction, open_time, close_time, open_price, close_price, lot_size, pnl_net, roi_percent))
        
        conn.commit()
        conn.close()
        logger.info(f"[{symbol}] Trade guardado en el historial (SQLite).")
    except Exception as e:
        logger.error(f"Error guardando trade en SQLite: {e}")
