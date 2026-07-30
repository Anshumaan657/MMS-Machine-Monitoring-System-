import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("ships safe deployment controls without committed secret values", async () => {
  const environment = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  assert.match(environment, /MMS_DB_READ_ONLY=true/);
  assert.match(environment, /OPENAI_API_KEY=\n/);
  assert.doesNotMatch(environment, /sk-[A-Za-z0-9]/);

  const health = await readFile(
    new URL("../app/api/health/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(health, /cache-control/);
  assert.doesNotMatch(health, /MMS_DB_PASSWORD/);
});
