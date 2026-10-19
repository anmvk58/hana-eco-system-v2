import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/features/supplierDebt.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { supplierLineTotal, supplierSum } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("line totals round half up to cents like backend Decimal", () => {
  assert.equal(supplierLineTotal("0.001", "5"), "0.01");
  assert.equal(supplierLineTotal("1.005", "1"), "1.01");
  assert.equal(supplierLineTotal("2.5", "10000.20"), "25000.50");
  assert.equal(supplierLineTotal("", ""), "0.00");
});

test("payment selection nets purchases, increases and decreases exactly", () => {
  assert.equal(supplierSum(["2000000.00", "80000.00", "-200000.00"]), "1880000.00");
  assert.equal(supplierSum(["0.10", "0.20", "-0.30"]), "0.00");
  assert.equal(supplierSum(["-80.01", "10.00"]), "-70.01");
  assert.equal(supplierSum([]), "0.00");
});

test("large line totals retain cents beyond safe integer precision", () => {
  assert.equal(supplierLineTotal("99999999999.999", "999999999999.99"), "99999999999998000000000.00");
});
