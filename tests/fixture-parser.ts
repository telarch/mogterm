/**
 * Parser for libvterm-inspired test fixture files (.vttest).
 *
 * Fixture format:
 *
 *   # Comment lines start with #
 *   !name: Test case name
 *   !size: rows cols
 *
 *   # Input section: raw bytes to feed (supports \e for ESC, \n for LF, etc.)
 *   !input
 *   Hello World
 *   \e[2;5H
 *
 *   # Assertions follow
 *   !cursor: row col          -- assert cursor position (0-based)
 *   !line: row "expected"     -- assert line text content
 *   !cell: row col char       -- assert cell character
 *   !attrs: row col key=val   -- assert cell attributes (bold=1, fg=2, etc.)
 */

export interface Assertion {
  type: "cursor" | "line" | "cell" | "attrs";
  args: string[];
}

export interface TestFixture {
  name: string;
  rows: number;
  cols: number;
  input: string;
  assertions: Assertion[];
}

/** Unescape a string: convert \e to ESC, \n to LF, \r to CR, \t to TAB, \xNN to byte. */
function unescapeInput(raw: string): string {
  let result = "";
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "e") {
        result += "\x1b";
        i += 2;
      } else if (next === "n") {
        result += "\n";
        i += 2;
      } else if (next === "r") {
        result += "\r";
        i += 2;
      } else if (next === "t") {
        result += "\t";
        i += 2;
      } else if (next === "\\") {
        result += "\\";
        i += 2;
      } else if (next === "x" && i + 3 < raw.length) {
        const hex = raw.substring(i + 2, i + 4);
        result += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        result += raw[i];
        i++;
      }
    } else {
      result += raw[i];
      i++;
    }
  }
  return result;
}

/** Parse a .vttest fixture file into one or more test cases. */
export function parseFixture(content: string): TestFixture[] {
  const lines = content.split("\n");
  const fixtures: TestFixture[] = [];

  let current: Partial<TestFixture> | null = null;
  let inInput = false;
  let inputLines: string[] = [];

  function finalize() {
    if (current) {
      if (inInput) {
        current.input = unescapeInput(inputLines.join("\n"));
        inInput = false;
      }
      fixtures.push({
        name: current.name || "unnamed",
        rows: current.rows || 24,
        cols: current.cols || 80,
        input: current.input || "",
        assertions: current.assertions || [],
      });
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip empty lines and comments outside input blocks
    if (!inInput && (line === "" || line.startsWith("#"))) continue;

    if (line.startsWith("!name:")) {
      // Start a new test case
      if (current) finalize();
      current = { name: line.slice(6).trim(), assertions: [] };
      inputLines = [];
      inInput = false;
      continue;
    }

    if (!current) {
      current = { name: "unnamed", assertions: [] };
      inputLines = [];
    }

    if (line.startsWith("!size:")) {
      const parts = line.slice(6).trim().split(/\s+/);
      current.rows = parseInt(parts[0], 10);
      current.cols = parseInt(parts[1], 10);
      continue;
    }

    if (line === "!input") {
      inInput = true;
      inputLines = [];
      continue;
    }

    if (line.startsWith("!end")) {
      if (inInput) {
        current.input = unescapeInput(inputLines.join("\n"));
        inInput = false;
      }
      continue;
    }

    if (inInput) {
      // Check if this is an assertion line (starts with !)
      if (line.startsWith("!")) {
        // End input section implicitly
        current.input = unescapeInput(inputLines.join("\n"));
        inInput = false;
        // Fall through to assertion parsing below
      } else {
        inputLines.push(line);
        continue;
      }
    }

    // Parse assertion directives
    if (line.startsWith("!cursor:")) {
      const args = line.slice(8).trim().split(/\s+/);
      current.assertions!.push({ type: "cursor", args });
    } else if (line.startsWith("!line:")) {
      const match = line.slice(6).trim().match(/^(\d+)\s+"(.*)"/);
      if (match) {
        current.assertions!.push({ type: "line", args: [match[1], match[2]] });
      }
    } else if (line.startsWith("!cell:")) {
      const args = line.slice(6).trim().split(/\s+/);
      current.assertions!.push({ type: "cell", args });
    } else if (line.startsWith("!attrs:")) {
      const args = line.slice(7).trim().split(/\s+/);
      current.assertions!.push({ type: "attrs", args });
    }
  }

  finalize();
  return fixtures;
}
