import { Resource } from "sst";
import { execSync } from "child_process";

const url = Resource.DATABASE_URL.value;
execSync(`DATABASE_URL="${url}" npx drizzle-kit push`, { stdio: "inherit" });
