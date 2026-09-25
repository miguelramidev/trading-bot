import fs from 'fs';
let c = fs.readFileSync('src/cron/analyze.ts', 'utf8');
c = c.replace('            });\\n          });\\n          }\\n        }\\n        \\n        }', '            });\\n          }\\n        }\\n        ');
fs.writeFileSync('src/cron/analyze.ts', c);
