import fs from "fs";
let content = fs.readFileSync("app/lib/main.dart", "utf8");

if (!content.includes("package:toastification/toastification.dart")) {
    content = content.replace(
        "import 'package:flutter_web_plugins/url_strategy.dart';",
        "import 'package:flutter_web_plugins/url_strategy.dart';\nimport 'package:toastification/toastification.dart';"
    );
    
    content = content.replace(
        "return MaterialApp(",
        "return ToastificationWrapper(\n      child: MaterialApp("
    );
    
    content = content.replace(
        "      },\n    );",
        "      },\n    ),\n    );"
    );
    fs.writeFileSync("app/lib/main.dart", content);
}
