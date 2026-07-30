import assert from "node:assert/strict";
import test from "node:test";

import {
  redactSensitiveText,
  safeOperationalError,
  sanitizeSpreadsheetText,
} from "../app/security.ts";

test("redacts secrets and connection credentials from operational errors", () => {
  const redacted = redactSensitiveText(
    "password=hunter2 api_key=sk-secret mysql://user:pass@host/db",
  );
  assert.doesNotMatch(redacted, /hunter2|sk-secret|:pass@/);
  assert.match(redacted, /\[REDACTED\]/);
  assert.doesNotMatch(
    safeOperationalError(new Error("authorization: Bearer token-value")),
    /token-value/,
  );
});

test("prevents spreadsheet formula injection without changing normal text", () => {
  assert.equal(sanitizeSpreadsheetText("Machine A"), "Machine A");
  assert.equal(sanitizeSpreadsheetText("=HYPERLINK(\"bad\")"), "'=HYPERLINK(\"bad\")");
});
