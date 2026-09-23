import fs from "fs";

function patchFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");
    const oldBody = `        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
        }),`;
    
    const newBody = `        body: jsonEncode({
          'binanceApiKey': _apiKeyController.text,
          'montoOperacion': int.tryParse(_amountController.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 25,
          'maxTrades': int.tryParse(_tradesController.text) ?? 5,
          'apalancamiento': int.tryParse(_leverageController.text) ?? 10,
        }),`;
        
    content = content.replace(oldBody, newBody);
    fs.writeFileSync(filePath, content);
}

patchFile("app/lib/screens/dashboard/mobile_settings.dart");
patchFile("app/lib/screens/dashboard/desktop_settings.dart");
