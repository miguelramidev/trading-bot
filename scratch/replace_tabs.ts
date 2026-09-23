import fs from "fs";

let content = fs.readFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", "utf8");

const oldTabs = `  Widget _buildHorizonTabs() {
    return Row(
      children: ['1D', '1S', '1M', 'YTD'].map((e) => Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: e == '1S' ? AppColors.winGreen.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(e, style: AppTheme.monoStyle.copyWith(color: e == '1S' ? AppColors.winGreen : AppColors.textSecondary, fontSize: 12)),
      )).toList(),
    );
  }`;

const newButton = `  Widget _buildHorizonTabs() {
    return InkWell(
      onTap: () {
        setState(() {
          _isLoading = true;
        });
        _fetchDashboardData();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            const Icon(Icons.sync, color: AppColors.textSecondary, size: 14),
            const SizedBox(width: 6),
            Text('Sincronizar', style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 12)),
          ],
        ),
      ),
    );
  }`;

content = content.replace(oldTabs, newButton);

fs.writeFileSync("app/lib/screens/dashboard/desktop_dashboard.dart", content);
