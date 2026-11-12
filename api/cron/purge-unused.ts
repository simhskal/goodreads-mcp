import { isCronAuthorized } from "../../packages/server-vercel/src/cron-auth.js";
import { getDatabase } from "../../packages/server-vercel/src/db.js";
import { purgeStaleAccounts } from "../../packages/server-vercel/src/purge.js";

export function GET(request: Request): Promise<Response> {
  return purge(request);
}

async function purge(request: Request): Promise<Response> {
  if (
    !isCronAuthorized(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const purged = await purgeStaleAccounts(getDatabase());
    return Response.json({ purged });
  } catch (error) {
    console.error(
      "Account purge failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return Response.json({ error: "Account purge failed." }, { status: 500 });
  }
}
