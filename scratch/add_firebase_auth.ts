import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");
    if (!content.includes("package:firebase_auth/firebase_auth.dart")) {
        content = content.replace("import 'package:flutter/material.dart';", "import 'package:flutter/material.dart';\nimport 'package:firebase_auth/firebase_auth.dart';");
    }
    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_dashboard.dart");
fixFile("app/lib/screens/dashboard/mobile_dashboard.dart");
