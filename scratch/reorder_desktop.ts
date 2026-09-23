import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");

// Change Save Button Text
content = content.replace("Guardar Parámetros de Motor", "Guardar configuración");

// Add placeholder to API Key
const oldTextField = `TextField(
            controller: _apiKeyController,
            obscureText: true,
            style: AppTheme.monoStyle.copyWith(color: AppColors.textPrimary, fontSize: 12),
            decoration: InputDecoration(
              filled: true,
              fillColor: AppColors.background,
              enabledBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(borderSide: const BorderSide(color: AppColors.winGreen), borderRadius: BorderRadius.circular(8)),
              
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

// Reorder blocks
const apiKeyBlock = `const Text('Binance API Key', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
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
          const SizedBox(height: 16),`;

const generatorBlockStart = `const Text('Generador de Llaves Ed25519 (Bypass IP Restriction)'`;
const generatorBlockEndRegex = /Container\(\s*padding: const EdgeInsets\.all\(12\),\s*decoration: BoxDecoration\(color: AppColors\.background, borderRadius: BorderRadius\.circular\(8\), border: Border\.all\(color: AppColors\.border\)\),\s*child: Row\(\s*children: \[\s*Expanded\(child: SelectableText\(_rsaPublicKey \?\? 'Presiona el botón para generar\.\.\.', style: AppTheme\.monoStyle\.copyWith\(color: _rsaPublicKey != null \? AppColors\.textPrimary : AppColors\.textSecondary, fontSize: 10\)\)\),\s*IconButton\([\s\S]*?\}\s*:\s*null,\s*\),\s*\]\,\s*\)\,\s*\)\,/m;

const match = content.match(generatorBlockEndRegex);
if(match) {
    const generatorBlockFull = content.substring(content.indexOf(generatorBlockStart), match.index! + match[0].length);
    
    // First, remove the API Key block from its original position
    content = content.replace(apiKeyBlock, "");
    
    // Then insert it AFTER the generator block
    content = content.replace(generatorBlockFull, generatorBlockFull + "\n          const SizedBox(height: 16),\n          " + apiKeyBlock);
}

fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
