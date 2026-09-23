import fs from "fs";

function patchFile(file: string, isDesktop: boolean, isSettings: boolean) {
    let content = fs.readFileSync(file, "utf8");
    
    // Add import if missing
    if (!content.includes("settings_screen.dart") && !isSettings) {
        content = `import 'settings_screen.dart';\n` + content;
    }
    if (!content.includes("dashboard_screen.dart") && isSettings) {
        content = `import '../dashboard_screen.dart';\n` + content;
    }
    
    if (isDesktop) {
        // Desktop Sidebar patching
        content = content.replace(
            `_sidebarIcon(Icons.grid_view, 'INICIO', ${!isSettings}),`,
            `GestureDetector(onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const DashboardScreen())), child: _sidebarIcon(Icons.grid_view, 'INICIO', ${!isSettings})),`
        );
        content = content.replace(
            `_sidebarIcon(Icons.tune, 'CONFIGURACIÓN', ${isSettings}),`,
            `GestureDetector(onTap: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SettingsScreen())), child: _sidebarIcon(Icons.tune, 'CONFIGURACIÓN', ${isSettings})),`
        );
    } else {
        // Mobile BottomNav patching
        // _buildBottomNav needs context
        content = content.replace(`Widget _buildBottomNav()`, `Widget _buildBottomNav(BuildContext context)`);
        content = content.replace(`bottomNavigationBar: _buildBottomNav(),`, `bottomNavigationBar: _buildBottomNav(context),`);
        
        // Add onTap
        const targetString = `items: const [`;
        const replacement = `onTap: (index) {
        if (index == 0) {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const DashboardScreen()));
        } else if (index == 2) {
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
        }
      },
      items: const [`;
        content = content.replace(targetString, replacement);
    }
    
    fs.writeFileSync(file, content);
}

patchFile("app/lib/screens/dashboard/desktop_dashboard.dart", true, false);
patchFile("app/lib/screens/dashboard/desktop_settings.dart", true, true);
patchFile("app/lib/screens/dashboard/mobile_dashboard.dart", false, false);
patchFile("app/lib/screens/dashboard/mobile_settings.dart", false, true);

