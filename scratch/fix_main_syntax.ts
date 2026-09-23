import fs from "fs";

let content = fs.readFileSync("app/lib/main.dart", "utf8");

content = content.replace(
    `      // home: const AuthWrapper(),
    );
  }
}`, 
    `      // home: const AuthWrapper(),
      ),
    );
  }
}`
);

content = content.replace(
`        // Si ya está logueado en Firebase Y pasó la biometría
        return DashboardScreen();
      },
    ),
    );
  }
}`,
`        // Si ya está logueado en Firebase Y pasó la biometría
        return DashboardScreen();
      },
    );
  }
}`
);

fs.writeFileSync("app/lib/main.dart", content);
