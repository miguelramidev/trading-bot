import re

def fix_file(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # The broken lines:
    # '\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}',
    # '${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}',
    
    # We will just replace them with "" quotes.
    
    # Replace entryPrice
    content = content.replace(
        "\'\\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}\'",
        "\"\\$${(p['entryPrice'] ?? 0).toStringAsFixed(2)}\""
    )
    
    # Replace unrealizedPnl
    content = content.replace(
        "\'${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}\'",
        "\"${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}\""
    )
    
    # Wait, earlier I also saw too many arguments:
    # error • Too many positional arguments: 6 expected, but 10 found.
    # Ah! `_buildTradeCard` takes:
    # pair, side, entry, size, pnl, pnlPct (6 arguments)
    # The inner quotes broke the parsing, so Dart thought there were 10 arguments!
    
    with open(filename, 'w') as f:
        f.write(content)

fix_file("app/lib/screens/dashboard/desktop_dashboard.dart")
fix_file("app/lib/screens/dashboard/mobile_dashboard.dart")
