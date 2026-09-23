import fs from "fs";

let content = fs.readFileSync("app/lib/main.dart", "utf8");

const importLine = `import 'package:flutter_web_plugins/url_strategy.dart';\n`;
if (!content.includes('flutter_web_plugins/url_strategy.dart')) {
    content = importLine + content;
}

const searchStr = `  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MacroQuantApp());`;

const replaceStr = `  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy(); // <-- Remueve el '#' de la URL
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const MacroQuantApp());`;

content = content.replace(searchStr, replaceStr);

fs.writeFileSync("app/lib/main.dart", content);
