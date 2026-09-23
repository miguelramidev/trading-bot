import fs from "fs";

function fixDesktop() {
    let content = fs.readFileSync("app/lib/screens/dashboard/desktop_settings.dart", "utf8");
    content = content.replace(
        `icon: _isGeneratingKeys ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.black)) : const Icon(Icons.save, color: Colors.black),
              label: const Text('Guardar configuración', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 16)),`,
        `icon: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.black)) : const Icon(Icons.save, color: Colors.black),
              label: const Text('Guardar configuración', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 16)),`
    );
    fs.writeFileSync("app/lib/screens/dashboard/desktop_settings.dart", content);
}

function fixMobile() {
    let content = fs.readFileSync("app/lib/screens/dashboard/mobile_settings.dart", "utf8");
    content = content.replace(
        `icon: _isGeneratingKeys ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.black)) : const Icon(Icons.save, color: Colors.black),
                label: const Text('Guardar configuración', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 16)),`,
        `icon: _isSaving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.black)) : const Icon(Icons.save, color: Colors.black),
                label: const Text('Guardar configuración', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold, fontSize: 16)),`
    );
    fs.writeFileSync("app/lib/screens/dashboard/mobile_settings.dart", content);
}

fixDesktop();
fixMobile();
