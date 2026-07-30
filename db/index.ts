import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type D1Binding = Parameters<typeof drizzle>[0];

/**
 * D1 remains optional and is injected by the Cloudflare adapter. Keeping the
 * binding out of a static `cloudflare:workers` import lets the same source tree
 * type-check on local, company-server, and Vercel deployments.
 */
export function getDb(database?: D1Binding | null) {
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Inject the binding before using the optional D1 store.",
    );
  }

  return drizzle(database, { schema });
}
