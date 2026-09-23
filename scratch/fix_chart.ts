import fs from "fs";

function fixChart(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    // 1. Add "Progreso Diario" text at the bottom.
    // The LineChart is currently inside a Container.
    // In Desktop, it's:
    // child: _chartData.isEmpty 
    //   ? const Center(...)
    //   : LineChart(...)
    
    // We want:
    // child: _chartData.isEmpty 
    //   ? const Center(...)
    //   : Column(
    //       crossAxisAlignment: CrossAxisAlignment.stretch,
    //       children: [
    //         Expanded(child: LineChart(...)),
    //         const SizedBox(height: 8),
    //         Text('Progreso Diario', textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
    //       ],
    //     )
    
    // 2. Fix titlesData to show Y-axis
    // titlesData: FlTitlesData(show: false)
    const newTitlesData = `titlesData: FlTitlesData(
                      show: true,
                      rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 40,
                          getTitlesWidget: (value, meta) {
                            return Text('\\$'+value.toInt().toString(), style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10));
                          },
                        ),
                      ),
                    )`;
                    
    content = content.replace(/titlesData: FlTitlesData\(show: false\)/, newTitlesData);

    // Replace LineChart(...) with Column(...)
    // Desktop first
    const lineChartRegex = /LineChart\(\s*LineChartData\([\s\S]*?\)(?=\s*\),)/;
    
    // Wait, manipulating AST with regex is hard here because of nested brackets.
    // Let's do it manually with a Python script and a balanced bracket matcher or simply string replacement.
    fs.writeFileSync(filePath, content);
}

fixChart("app/lib/screens/dashboard/desktop_dashboard.dart");
fixChart("app/lib/screens/dashboard/mobile_dashboard.dart");
