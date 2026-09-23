import fs from "fs";

function fixFile(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    // 1. Rename _isLoading to _isSaving in _saveConfig and the save button
    content = content.replace(/bool _isLoading = false;/g, "bool _isSaving = false;\n  bool _isGeneratingKeys = false;");
    
    // In _saveConfig
    content = content.replace(/_isLoading = true/g, "_isSaving = true");
    content = content.replace(/_isLoading = false/g, "_isSaving = false");
    
    // The Save Button disabled state and loading state
    content = content.replace(/_isLoading \? null : _saveConfig/g, "(_isSaving || _isGeneratingKeys) ? null : _saveConfig");
    
    // Save button loading spinner (icon)
    content = content.replace(/_isLoading \? const SizedBox\(width: 16, height: 16, child: CircularProgressIndicator\(color: Colors.black, strokeWidth: 2\)\)/g, "_isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.black, strokeWidth: 2))");

    // 2. Fix _generateRSA to use _isGeneratingKeys
    content = content.replace(/setState\(\(\) => _isSaving = true\);\n    try \{\n      final user = FirebaseAuth.instance.currentUser;\n      if \(user == null\) return;\n      \n      final response = await http.post\(/g, "setState(() => _isGeneratingKeys = true);\n    try {\n      final user = FirebaseAuth.instance.currentUser;\n      if (user == null) return;\n      \n      final response = await http.post(");
    
    content = content.replace(/if \(mounted\) setState\(\(\) => _isSaving = false\);\n    \}\n  \}/g, "if (mounted) setState(() => _isGeneratingKeys = false);\n    }\n  }");

    // 3. Fix the "Generar" button onPressed
    content = content.replace(/onPressed: \(\) \{\s*ScaffoldMessenger\.of\(context\)\.showSnackBar\([^;]+\);\s*\},/g, "onPressed: (_isSaving || _isGeneratingKeys) ? null : _generateRSA,");
    
    // The previous _generateRSA replace failed, so the dummy SnackBar might still be there in the Generate button
    content = content.replace(/onPressed: \(\) \{\s*toastification\.show\([^;]+\);\s*\},/g, "onPressed: (_isSaving || _isGeneratingKeys) ? null : _generateRSA,");

    // 4. Fix the "Generar" button loading spinner
    content = content.replace(/_isLoading \? const SizedBox/g, "_isGeneratingKeys ? const SizedBox");

    fs.writeFileSync(filePath, content);
}

fixFile("app/lib/screens/dashboard/desktop_settings.dart");
fixFile("app/lib/screens/dashboard/mobile_settings.dart");
