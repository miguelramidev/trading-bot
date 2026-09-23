import fs from "fs";

let content = fs.readFileSync("src/db/schema.ts", "utf8");
content = content.replace(
    'reportDate: timestamp("report_date").defaultNow().notNull(),',
    'firebaseUid: text("firebase_uid").notNull(),\n  reportDate: timestamp("report_date").defaultNow().notNull(),'
);

fs.writeFileSync("src/db/schema.ts", content);
