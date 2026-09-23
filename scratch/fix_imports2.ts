import fs from "fs";

function replaceInFile(file: string, search: string, replace: string) {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(search, replace);
    fs.writeFileSync(file, content);
}

replaceInFile("app/lib/screens/dashboard/desktop_settings.dart", "import '../../dashboard_screen.dart';", "import '../dashboard_screen.dart';");
replaceInFile("app/lib/screens/dashboard/mobile_settings.dart", "import '../../dashboard_screen.dart';", "import '../dashboard_screen.dart';");
replaceInFile("app/lib/screens/dashboard/mobile_dashboard.dart", "import '../../dashboard_screen.dart';", "import '../dashboard_screen.dart';");
replaceInFile("app/lib/screens/dashboard/desktop_dashboard.dart", "import '../../dashboard_screen.dart';", "import '../dashboard_screen.dart';");

// Mobile settings also needs import 'settings_screen.dart' to navigate to itself or we just remove the navigation to settings from settings.
// Actually, from Settings we don't need to navigate to Settings.
