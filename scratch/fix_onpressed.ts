import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    const dummyOnPressed = `onPressed: () {
               // Aquí se generaría la llave pública/privada
               ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generando par de llaves RSA...'), backgroundColor: AppColors.winGreen));
            },`;

    const newOnPressed = `onPressed: (_isSaving || _isGeneratingKeys) ? null : _generateRSA,`;
    
    // Desktop dummy code
    content = content.replace(dummyOnPressed, newOnPressed);
    
    // Mobile dummy code
    const mobileDummy = `onPressed: () {
                        // Aquí se generaría la llave pública/privada
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generando par de llaves RSA...'), backgroundColor: AppColors.winGreen));
                      },`;
    content = content.replace(mobileDummy, newOnPressed);

    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_settings.dart");
fixFile("app/lib/screens/dashboard/mobile_settings.dart");
