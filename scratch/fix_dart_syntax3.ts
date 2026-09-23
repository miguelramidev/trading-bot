import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");
    content = content.replace(/_tradeRow\(\s*p\['symbol'\] \?\? 'UNKNOWN',\s*"[^"]*",\s*'[^']*',\s*'[^']*',\s*"[^"]*"\s*\)/g, 
`_tradeRow(
                  p['symbol'] ?? 'UNKNOWN',
                  "\${p['side']?.toString().toUpperCase() ?? ''} \${p['leverage'] ?? 1}x",
                  "\\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}",
                  "\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}",
                  "\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%",
                )`);
    fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
}

function fixMobile() {
    let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");
    content = content.replace(/_buildTradeCard\(\s*p\['symbol'\] \?\? 'UNKNOWN',\s*"[^"]*",\s*'[^']*',\s*p\['size'\]\.toString\(\),\s*'[^']*',\s*"[^"]*"\s*,\s*\)/g, 
`_buildTradeCard(
                  p['symbol'] ?? 'UNKNOWN',
                  "\${p['side']?.toString().toUpperCase() ?? ''} \${p['leverage'] ?? 1}x",
                  "\\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}",
                  p['size'].toString(),
                  "\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}",
                  "\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%",
                )`);
    fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
}

// Just do direct replacement
function forceFix(file: string, funcName: string) {
    let content = fs.readFileSync(file, "utf8");
    
    // Instead of complex regex, let's just replace the exact lines
    content = content.replace(/'\\\$\$\{\(p\['entryPrice'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, '"\\$\\${(p[\\'entryPrice\\'] ?? 0).toStringAsFixed(2)}"');
    content = content.replace(/'\$\{\(p\['unrealizedPnl'\] \?\? 0\) >= 0 \? '\+' : ''\}\\\$\$\{\(p\['unrealizedPnl'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, '"\\${(p[\\'unrealizedPnl\\'] ?? 0) >= 0 ? \\'+\\' : \\'\\'}\\$\\${(p[\\'unrealizedPnl\\'] ?? 0).toStringAsFixed(2)}"');

    fs.writeFileSync(file, content);
}

forceFix("app/lib/screens/dashboard/desktop_dashboard.dart", "_tradeRow");
forceFix("app/lib/screens/dashboard/mobile_dashboard.dart", "_buildTradeCard");

