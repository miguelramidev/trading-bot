import fs from "fs";

function replaceNamed(file: string) {
    let content = fs.readFileSync(file, "utf8");
    
    content = content.replace(/Navigator\.pushReplacement\(context,\s*MaterialPageRoute\(builder:\s*\(_\)\s*=>\s*const\s*DashboardScreen\(\)\)\)/g, "Navigator.pushReplacementNamed(context, '/dashboard')");
    
    content = content.replace(/Navigator\.pushReplacement\(context,\s*MaterialPageRoute\(builder:\s*\(_\)\s*=>\s*const\s*SettingsScreen\(\)\)\)/g, "Navigator.pushReplacementNamed(context, '/settings')");
    
    fs.writeFileSync(file, content);
}

replaceNamed("app/lib/screens/dashboard/desktop_dashboard.dart");
replaceNamed("app/lib/screens/dashboard/desktop_settings.dart");
replaceNamed("app/lib/screens/dashboard/mobile_dashboard.dart");
replaceNamed("app/lib/screens/dashboard/mobile_settings.dart");
