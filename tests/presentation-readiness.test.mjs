import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ensureWorkbookReadPermission,
  supportsPersistentWorkbookHandles,
} from "../app/workbook-handle-storage.ts";

test("server environments do not claim persistent file-handle support", () => {
  assert.equal(supportsPersistentWorkbookHandles(), false);
});

test("already granted workbook permission does not prompt again", async () => {
  let requestCount = 0;
  const permitted = await ensureWorkbookReadPermission({
    name: "sample.xlsx",
    async getFile() {
      throw new Error("not used");
    },
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      requestCount += 1;
      return "granted";
    },
  });
  assert.equal(permitted, true);
  assert.equal(requestCount, 0);
});

test("workbook permission can be granted or denied explicitly", async () => {
  const handle = (permission) => ({
    name: "sample.xlsx",
    async getFile() {
      throw new Error("not used");
    },
    async queryPermission() {
      return "prompt";
    },
    async requestPermission() {
      return permission;
    },
  });
  assert.equal(await ensureWorkbookReadPermission(handle("granted")), true);
  assert.equal(await ensureWorkbookReadPermission(handle("denied")), false);
});

test("presentation metadata prevents staging indexing and defines a favicon", async () => {
  const [layout, robots, runbook] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/robots.txt", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRESENTATION_RUNBOOK.md", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /favicon\.svg/);
  assert.match(robots, /Disallow:\s*\//);
  assert.match(runbook, /Exact Shareable Link tested/);
});
