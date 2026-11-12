import { runMigrationsFromEnv } from "./migrate.js";
import { sanitizeDbMessage } from "./postgres-config.js";

try {
  const result = await runMigrationsFromEnv();
  console.log(result.message);
} catch (error) {
  console.error(sanitizeDbMessage(error));
  process.exit(1);
}
