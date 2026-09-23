import fs from "fs";

let content = fs.readFileSync("app/lib/main.dart", "utf8");

const badTransitions = `        pageTransitionsTheme: PageTransitionsTheme(
          builders: kIsWeb ? {
            for (final platform in TargetPlatform.values)
              platform: const NoAnimationPageTransitionsBuilder(),
          } : {
            TargetPlatform.android: ZoomPageTransitionsBuilder(),
            TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          },
        ),`;

const goodTransitions = `        pageTransitionsTheme: PageTransitionsTheme(
          builders: kIsWeb ? {
            TargetPlatform.windows: const NoAnimationPageTransitionsBuilder(),
            TargetPlatform.macOS: const NoAnimationPageTransitionsBuilder(),
            TargetPlatform.linux: const NoAnimationPageTransitionsBuilder(),
            TargetPlatform.android: const NoAnimationPageTransitionsBuilder(),
            TargetPlatform.iOS: const NoAnimationPageTransitionsBuilder(),
            TargetPlatform.fuchsia: const NoAnimationPageTransitionsBuilder(),
          } : const {
            TargetPlatform.android: ZoomPageTransitionsBuilder(),
            TargetPlatform.iOS: ZoomPageTransitionsBuilder(),
            TargetPlatform.windows: ZoomPageTransitionsBuilder(),
            TargetPlatform.macOS: ZoomPageTransitionsBuilder(),
            TargetPlatform.linux: ZoomPageTransitionsBuilder(),
            TargetPlatform.fuchsia: ZoomPageTransitionsBuilder(),
          },
        ),`;

content = content.replace(badTransitions, goodTransitions);
fs.writeFileSync("app/lib/main.dart", content);
