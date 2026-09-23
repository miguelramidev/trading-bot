def fix_file(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Find the block:
    # child: _chartData.isEmpty 
    #   ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
    #   : LineChart(
    
    target = """child: _chartData.isEmpty 
              ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
              : LineChart("""
              
    desktop_replacement = """child: _chartData.isEmpty 
              ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: LineChart("""
                    
    if "desktop_dashboard" in file_path:
        content = content.replace(target, desktop_replacement)
        # Find the end of the LineChart to close the Column
        # The LineChart block ends with:
        #           ),
        #         ),
        #   ),
        # )`
        # Let's just replace the exact end of LineChart block in desktop.
        end_target = """                ),
          ),
        )"""
        end_replacement = """                ),
                    ),
                    const SizedBox(height: 8),
                    Text('Progreso Diario', textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
                  ],
                ),
          ),
        )"""
        content = content.replace(end_target, end_replacement)
        
    else:
        # mobile dashboard
        target_mobile = """child: _chartData.isEmpty 
        ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
        : LineChart("""
        
        mobile_replacement = """child: _chartData.isEmpty 
        ? const Center(child: CircularProgressIndicator(color: AppColors.winGreen))
        : Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: LineChart("""
        content = content.replace(target_mobile, mobile_replacement)
        
        end_target_mobile = """            ),
          ),
    );"""
        end_replacement_mobile = """            ),
              ),
              const SizedBox(height: 8),
              Text('Progreso Diario', textAlign: TextAlign.center, style: AppTheme.monoStyle.copyWith(color: AppColors.textSecondary, fontSize: 10)),
            ],
          ),
    );"""
        content = content.replace(end_target_mobile, end_replacement_mobile)

    with open(file_path, 'w') as f:
        f.write(content)

fix_file("app/lib/screens/dashboard/desktop_dashboard.dart")
fix_file("app/lib/screens/dashboard/mobile_dashboard.dart")
