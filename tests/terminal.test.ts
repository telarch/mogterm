import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TerminalTestAdapter } from "./adapter.js";
import { parseFixture, TestFixture, Assertion } from "./fixture-parser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures");

/** Run a single assertion against the adapter. */
function runAssertion(adapter: TerminalTestAdapter, assertion: Assertion): void {
  switch (assertion.type) {
    case "cursor": {
      const [row, col] = assertion.args.map(Number);
      const [actualRow, actualCol] = adapter.getCursor();
      expect(actualRow, `cursor row`).toBe(row);
      expect(actualCol, `cursor col`).toBe(col);
      break;
    }

    case "line": {
      const row = parseInt(assertion.args[0], 10);
      const expected = assertion.args[1];
      const actual = adapter.getLineText(row);
      expect(actual, `line ${row}`).toBe(expected);
      break;
    }

    case "cell": {
      const row = parseInt(assertion.args[0], 10);
      const col = parseInt(assertion.args[1], 10);
      const expectedChar = assertion.args[2];
      const actual = adapter.getCellChar(row, col);
      expect(actual, `cell [${row},${col}]`).toBe(expectedChar);
      break;
    }

    case "attrs": {
      const row = parseInt(assertion.args[0], 10);
      const col = parseInt(assertion.args[1], 10);
      const attrs = adapter.getCellAttrs(row, col);

      // Remaining args are key=value pairs
      const boolAttrs = new Set(["bold", "italic", "underline", "reverse"]);
      for (let i = 2; i < assertion.args.length; i++) {
        const [key, val] = assertion.args[i].split("=");
        const attrRecord = attrs as Record<string, unknown>;
        if (val === "null") {
          expect(attrRecord[key], `attrs [${row},${col}].${key}`).toBeNull();
        } else if (boolAttrs.has(key)) {
          expect(attrRecord[key], `attrs [${row},${col}].${key}`).toBe(val === "1");
        } else {
          expect(attrRecord[key], `attrs [${row},${col}].${key}`).toBe(parseInt(val, 10));
        }
      }
      break;
    }
  }
}

/** Run a single fixture test case. */
function runFixture(fixture: TestFixture): void {
  const adapter = new TerminalTestAdapter(fixture.rows, fixture.cols);
  adapter.feedInput(fixture.input);

  for (const assertion of fixture.assertions) {
    runAssertion(adapter, assertion);
  }
}

// Load and run all .vttest fixture files
const fixtureFiles = readdirSync(fixturesDir)
  .filter(f => f.endsWith(".vttest"))
  .sort();

for (const file of fixtureFiles) {
  const content = readFileSync(join(fixturesDir, file), "utf-8");
  const fixtures = parseFixture(content);

  describe(file, () => {
    for (const fixture of fixtures) {
      it(fixture.name, () => {
        runFixture(fixture);
      });
    }
  });
}
