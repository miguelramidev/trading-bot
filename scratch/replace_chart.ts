import fs from "fs";

function fixChart(filePath: string) {
    let content = fs.readFileSync(filePath, "utf8");

    const blockStart = `  Widget _buildPerformanceChart() {`;
    const nextBlockStart = `  Widget _buildBalanceCard(BuildContext context) {`;
    
    // We only need to fix mobile_dashboard.dart since desktop doesn't have _buildPerformanceChart, 
    // Wait, desktop_dashboard doesn't have `_buildPerformanceChart()`? Desktop has it inline inside Expanded!
    
    if (filePath.includes("mobile")) {
        const fullBlock = `  Widget _buildPerformanceChart() {
    return Container(
      height: 180,
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.only(top: 24, right: 24, bottom: 12, left: 12),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: _chartData.isEmpty 
        ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: LineChart(
                  LineChartData(
                    gridData: FlGridData(show: false),
                    borderData: FlBorderData(show: false),
                    titlesData: FlTitlesData(
                      show: true,
                      rightTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      topTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      bottomTitles: AxisTitles(sideTitles: SideTitles(showTitles: false)),
                      leftTitles: AxisTitles(
                        sideTitles: SideTitles(
                          showTitles: true,
                          reservedSize: 40,
                          getTitlesWidget: (value, meta) {
                            return Text('\\$' + value.toInt().toString(), style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10));
                          },
                        ),
                      ),
                    ),
                    lineBarsData: [
                      LineChartBarData(
                        spots: _chartData.asMap().entries.map((e) {
                          return FlSpot(e.key.toDouble(), (e.value['balance'] ?? 0).toDouble());
                        }).toList(),
                        isCurved: true,
                        color: AppColors.winGreen,
                        barWidth: 2,
                        isStrokeCapRound: true,
                        dotData: FlDotData(show: false),
                        belowBarData: BarAreaData(
                          show: true,
                          color: AppColors.winGreen.withValues(alpha: 0.1),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text('Progreso Diario', textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
            ],
          ),
    );
  }`;
        
        // Find everything between blockStart and nextBlockStart
        const regex = new RegExp(blockStart + "[\\s\\S]*?(?=" + nextBlockStart + ")");
        content = content.replace(regex, fullBlock + "\n\n");
    }
    
    fs.writeFileSync(filePath, content);
}

fixChart("app/lib/screens/dashboard/mobile_dashboard.dart");
