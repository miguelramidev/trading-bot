import re

def fix(file):
    with open(file, 'r') as f:
        content = f.read()

    # Find the trade row section and replace all single quotes bounding string interpolation with double quotes
    content = content.replace("'\\${(p[\\'entryPrice\\'] ?? 0).toStringAsFixed(2)}'", '"\\$${(p[\'entryPrice\'] ?? 0).toStringAsFixed(2)}"')
    content = content.replace("'${(p[\\'unrealizedPnl\\'] ?? 0) >= 0 ? '+' : ''}\\${(p[\\'unrealizedPnl\\'] ?? 0).toStringAsFixed(2)}'", '"${(p[\'unrealizedPnl\'] ?? 0) >= 0 ? \'+\' : \'\'}\\$${(p[\'unrealizedPnl\'] ?? 0).toStringAsFixed(2)}"')
    
    with open(file, 'w') as f:
        f.write(content)

fix("app/lib/screens/dashboard/desktop_dashboard.dart")
fix("app/lib/screens/dashboard/mobile_dashboard.dart")
