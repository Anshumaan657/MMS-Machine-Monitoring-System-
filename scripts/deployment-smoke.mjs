import { readFile } from "node:fs/promises";

const requiredFiles = [
  ".env.example",
  "app/error.tsx",
  "app/global-error.tsx",
  "app/api/health/route.ts",
];

for (const file of requiredFiles) {
  await readFile(new URL(`../${file}`, import.meta.url), "utf8");
}

const environmentTemplate = await readFile(
  new URL("../.env.example", import.meta.url),
  "utf8",
);
for (const line of environmentTemplate.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [name, value = ""] = line.split("=", 2);
  if (
    /KEY|PASSWORD|SECRET|TOKEN/.test(name) &&
    value.trim() &&
    value.trim() !== "[REQUIRED]"
  ) {
    throw new Error(`Secret-like value found in .env.example: ${name}`);
  }
}

console.log("Deployment smoke checks passed.");
