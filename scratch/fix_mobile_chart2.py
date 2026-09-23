def fix_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    target = "return Text('\\,\n              borderData: FlBorderData(show: false),"
    replacement = "return Text('\\$' + value.toInt().toString(), style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10));\n                          },\n                        ),\n                      ),\n                    ),\n              borderData: FlBorderData(show: false),"
    
    if target in content:
        content = content.replace(target, replacement)
    
    with open(file_path, 'w') as f:
        f.write(content)

fix_file("app/lib/screens/dashboard/mobile_dashboard.dart")
fix_file("app/lib/screens/dashboard/desktop_dashboard.dart")
