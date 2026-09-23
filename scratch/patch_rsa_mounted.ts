import fs from "fs";

function patchFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");
    
    content = content.replace(
        "ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Par de llaves generadas. Copia la pública a Binance.'), backgroundColor: AppColors.winGreen));",
        "if (!mounted) return;\n        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Par de llaves generadas. Copia la pública a Binance.'), backgroundColor: AppColors.winGreen));"
    );
    
    content = content.replace(
        "ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.lossRed));",
        "if (!mounted) return;\n        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.lossRed));"
    );

    fs.writeFileSync(filePath, content);
}

patchFile("app/lib/screens/dashboard/mobile_settings.dart");
patchFile("app/lib/screens/dashboard/desktop_settings.dart");
