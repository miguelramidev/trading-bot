import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");
    
    // Fix string interpolations
    content = content.replace(/'\$\{\(p\['side'\] \?\? ''\)\.toString\(\)\.toUpperCase\(\)\} \$\{p\['leverage'\] \?\? 1\}x'/g, 
                              `"\${p['side']?.toString().toUpperCase() ?? ''} \${p['leverage'] ?? 1}x"`);
    content = content.replace(/'\\\$\$\{\(p\['entryPrice'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, 
                              `"\\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}"`);
    content = content.replace(/'\$\{\(p\['unrealizedPnl'\] \?\? 0\) >= 0 \? '\+' : ''\}\\\$\$\{\(p\['unrealizedPnl'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, 
                              `"\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}"`);
    content = content.replace(/'\$\{\(p\['percentage'\] \?\? 0\) >= 0 \? '\+' : ''\}\$\{\(p\['percentage'\] \?\? 0\)\.toStringAsFixed\(2\)}%'/g, 
                              `"\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%"`);

    // Fix brandBlue
    content = content.replace(/AppColors\.brandBlue/g, "AppColors.winGreen");
    
    fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
}

function fixMobile() {
    let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");
    
    content = content.replace(/'\$\{\(p\['side'\] \?\? ''\)\.toString\(\)\.toUpperCase\(\)\} \$\{p\['leverage'\] \?\? 1\}x'/g, 
                              `"\${p['side']?.toString().toUpperCase() ?? ''} \${p['leverage'] ?? 1}x"`);
    content = content.replace(/'\\\$\$\{\(p\['entryPrice'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, 
                              `"\\$\${(p['entryPrice'] ?? 0).toStringAsFixed(2)}"`);
    content = content.replace(/'\$\{\(p\['unrealizedPnl'\] \?\? 0\) >= 0 \? '\+' : ''\}\\\$\$\{\(p\['unrealizedPnl'\] \?\? 0\)\.toStringAsFixed\(2\)}'/g, 
                              `"\${(p['unrealizedPnl'] ?? 0) >= 0 ? '+' : ''}\\$\${(p['unrealizedPnl'] ?? 0).toStringAsFixed(2)}"`);
    content = content.replace(/'\$\{\(p\['percentage'\] \?\? 0\) >= 0 \? '\+' : ''\}\$\{\(p\['percentage'\] \?\? 0\)\.toStringAsFixed\(2\)}%'/g, 
                              `"\${(p['percentage'] ?? 0) >= 0 ? '+' : ''}\${(p['percentage'] ?? 0).toStringAsFixed(2)}%"`);
                              
    // Fix brandBlue
    content = content.replace(/AppColors\.brandBlue/g, "AppColors.winGreen");
    
    fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
}

fixDesktop();
fixMobile();
