import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", "utf8");

// 1. Import fl_chart
content = content.replace(
    `import 'package:flutter/material.dart';`,
    `import 'package:flutter/material.dart';\nimport 'package:fl_chart/fl_chart.dart';`
);

// 2. Add state variable
content = content.replace(
    `List<dynamic> _signals = [];`,
    `List<dynamic> _signals = [];\n  List<dynamic> _chartData = [];`
);

content = content.replace(
    `_signals = data['signals'] ?? [];`,
    `_signals = data['signals'] ?? [];\n            _chartData = data['chartData'] ?? [];`
);

// 3. Add LineChart below _buildBalanceCard
const chartWidget = `
  Widget _buildPerformanceChart() {
    return Container(
      height: 180,
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.only(top: 24, right: 24, bottom: 12, left: 12),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
      child: _chartData.isEmpty 
        ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
        : LineChart(
            LineChartData(
              gridData: FlGridData(show: false),
              titlesData: FlTitlesData(show: false),
              borderData: FlBorderData(show: false),
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
    );
  }
`;

content = content.replace(
    `  Widget _buildBalanceCard(BuildContext context) {`,
    chartWidget + `\n  Widget _buildBalanceCard(BuildContext context) {`
);

content = content.replace(
    `_buildBalanceCard(context),`,
    `_buildBalanceCard(context),\n            _buildPerformanceChart(),`
);

fs.writeFileSync("app/lib/screens/dashboard/mobile_dashboard.dart", content);
