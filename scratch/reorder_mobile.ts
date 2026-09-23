import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");

// Change Save Button Text
content = content.replace("Guardar Parámetros de Motor", "Guardar configuración");

// Add placeholder to API Key and remove the weird suffixIcon
const oldTextField = `TextField(
                    controller: _apiKeyController,
                    obscureText: true,
                    style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppColors.background,
                      enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
                      focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
                      suffixIcon: const Icon(Icons.copy, color: AppColors.textSecondary, size: 16),
                    ),
                  ),`;
                  
const newTextField = `TextField(
                    controller: _apiKeyController,
                    obscureText: true,
                    style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Coloca aqui el api key dado por binance',
                      hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.5)),
                      filled: true,
                      fillColor: AppColors.background,
                      enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
                      focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
                    ),
                  ),`;
                  
content = content.replace(oldTextField, newTextField);

// Fix the uppercase text
content = content.replace(/GENERADOR DE LLAVES RSA/g, "GENERADOR DE LLAVES Ed25519");

// Reorder blocks
const apiKeyBlock = `const Text('BINANCE API KEY', style: TextStyle(color: AppColors.textSecondary, fontSize: 10, letterSpacing: 1)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _apiKeyController,
                    obscureText: true,
                    style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
                    decoration: InputDecoration(
                      hintText: 'Coloca aqui el api key dado por binance',
                      hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.5)),
                      filled: true,
                      fillColor: AppColors.background,
                      enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
                      focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 24),`;

const generatorBlockStart = `const Text('GENERADOR DE LLAVES Ed25519'`;
const generatorBlockEndRegex = /Container\(\s*width: double\.infinity,\s*padding: const EdgeInsets\.all\(12\),\s*decoration: BoxDecoration\(color: AppColors\.background, borderRadius: BorderRadius\.circular\(8\), border: Border\.all\(color: AppColors\.border\)\),\s*child: Row\(\s*mainAxisAlignment: MainAxisAlignment\.spaceBetween,\s*children: \[\s*Expanded\(child: SelectableText\(_rsaPublicKey \?\? 'Presiona el botón para generar\.\.\.', style: AppTheme\.monoStyle\.copyWith\(color: _rsaPublicKey != null \? AppColors\.textPrimary : AppColors\.textSecondary, fontSize: 10\)\)\),\s*IconButton\([\s\S]*?\}\s*:\s*null,\s*\),\s*\]\,\s*\)\,\s*\)\,/m;

const match = content.match(generatorBlockEndRegex);
if(match) {
    const generatorBlockFull = content.substring(content.indexOf(generatorBlockStart), match.index! + match[0].length);
    
    // First, remove the API Key block from its original position
    content = content.replace(apiKeyBlock, "");
    
    // Then insert it AFTER the generator block
    content = content.replace(generatorBlockFull, generatorBlockFull + "\n                  const SizedBox(height: 24),\n                  " + apiKeyBlock);
}

fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
