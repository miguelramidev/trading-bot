import fs from "fs";

let content = fs.readFileSync("app/lib/main.dart", "utf8");

const importLine = `import 'screens/dashboard/settings_screen.dart';\n`;
if (!content.includes('settings_screen.dart')) {
    content = content.replace("import 'screens/dashboard_screen.dart';", "import 'screens/dashboard_screen.dart';\nimport 'screens/dashboard/settings_screen.dart';");
}

const customTransition = `
class NoAnimationPageTransitionsBuilder extends PageTransitionsBuilder {
  const NoAnimationPageTransitionsBuilder();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    return child;
  }
}
`;

content = content + customTransition;

const themeReplacement = `theme: AppTheme.darkTheme.copyWith(
        pageTransitionsTheme: PageTransitionsTheme(
          builders: kIsWeb ? {
            for (final platform in TargetPlatform.values)
              platform: const NoAnimationPageTransitionsBuilder(),
          } : const {
            TargetPlatform.android: ZoomPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const AuthWrapper(),
        '/dashboard': (context) => const DashboardScreen(),
        '/settings': (context) => const SettingsScreen(),
      },`;

content = content.replace(`theme: AppTheme.darkTheme,`, themeReplacement);
content = content.replace(`home: const AuthWrapper(),`, `// home: const AuthWrapper(),`); // remove home

fs.writeFileSync("app/lib/main.dart", content);
