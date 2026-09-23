import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    // Replace brandBlue with winGreen
    content = content.replace(/AppColors\.brandBlue/g, "AppColors.winGreen");

    // Fix broken quotes in string interpolation
    content = content.replace(/\\\$\\\{\(p\['/g, "\\\${(p['"); // wait, maybe my node script output exact characters
    
    // Let's just fix it using robust replace
    
    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_dashboard.dart");
fixFile("app/lib/screens/dashboard/mobile_dashboard.dart");
