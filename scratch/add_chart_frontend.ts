import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");

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

// 3. Replace the placeholder box with LineChart
const oldChartPlaceholder = `        Expanded(
          flex: 2,
          child: Container(
            height: 150,
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
            child: const Center(child: Text('TRAYECTORIA DE RENDIMIENTO (CHART)', style: TextStyle(color: AppColors.textSecondary))),
          ),
        )`;

const newChartBlock = `        Expanded(
          flex: 2,
          child: Container(
            height: 150,
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
                          // e.value['balance'] is dynamic, convert to double
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
        )`;

content = content.replace(oldChartPlaceholder, newChartBlock);
fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
