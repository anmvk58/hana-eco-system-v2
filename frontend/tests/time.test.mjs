import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const source = await readFile(new URL("../src/utils/time.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
const time = await import(moduleUrl);

test("Vietnam midnight boundaries match UTC backend filters", () => {
  assert.equal(time.vietnamDateInputValue("2026-10-10T16:59:59Z"), "2026-10-10");
  assert.equal(time.vietnamDateInputValue("2026-10-10T17:00:00Z"), "2026-10-11");
  assert.equal(time.vietnamDateInputValue("2026-10-11T16:59:59Z"), "2026-10-11");
  assert.equal(time.vietnamDateInputValue("2026-10-11T17:00:00Z"), "2026-10-12");
});

test("explicit offsets and UTC fallback represent the same instant", () => {
  assert.equal(time.dateTime("2026-10-10T18:34:23Z"), time.dateTime("2026-10-11T01:34:23+07:00"));
  assert.equal(time.utcDateTime("2026-10-10T18:34:23"), time.dateTime("2026-10-10T18:34:23Z"));
  assert.equal(time.timeOnly("2026-10-10T18:34:23Z"), "01:34");
});

test("calendar arithmetic handles month, year and leap-day boundaries", () => {
  assert.equal(time.shiftCalendarDate("2026-01-01", -1), "2025-12-31");
  assert.equal(time.shiftCalendarDate("2024-02-28", 1), "2024-02-29");
  assert.equal(time.shiftCalendarDate("2026-03-01", -1), "2026-02-28");
  assert.equal(time.calendarDateValue(time.parseCalendarDate("2026-10-11")), "2026-10-11");
});

test("all user timezone settings produce identical presets, print times and report days", () => {
  const script = `const t = await import(${JSON.stringify(moduleUrl)});
    const clock = new Date("2026-10-10T18:34:23Z");
    console.log(JSON.stringify([t.todayInputValue(clock), t.dateOnly(clock.toISOString()),
      t.timeOnly(clock.toISOString()), t.localTimeValue(clock), t.dateOnly("2026-10-11"),
      t.calendarDateValue(t.parseCalendarDate("2026-10-11"))]));`;
  const results = ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh", "Pacific/Auckland"].map((TZ) => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  });
  assert.deepEqual(results[0], ["2026-10-11", "11/10/2026", "01:34", "01:34:23", "11/10/2026", "2026-10-11"]);
  for (const result of results) assert.deepEqual(result, results[0]);
});
