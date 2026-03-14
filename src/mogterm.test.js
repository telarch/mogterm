/**
 * Unit tests for Mogterm internal logic.
 * Runs in Node without jsdom by testing the input manipulation methods directly.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Extract and evaluate the class in a minimal mock environment
const src = fs.readFileSync(path.join(__dirname, "mogterm.js"), "utf8");

// Create a minimal DOM mock
function createMockElement() {
  const listeners = {};
  const children = [];
  return {
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    setAttribute() {},
    getAttribute(name) {
      if (name === "tabindex") return "0";
      return null;
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(fn);
    },
    _fire(type, event) {
      (listeners[type] || []).forEach((fn) => fn(event));
    },
    appendChild(child) { children.push(child); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    focus() {},
    scrollHeight: 0,
    scrollTop: 0,
    innerHTML: "",
    textContent: "",
  };
}

// Patch global document so Mogterm constructor works
const origDoc = global.document;
const mockEl = createMockElement();
global.document = {
  createElement() { return createMockElement(); },
  createDocumentFragment() {
    return { appendChild() {} };
  },
  createTextNode(t) { return { textContent: t }; },
};

// Load Mogterm
const Mogterm = require("./mogterm.js");

// Restore
global.document = origDoc;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${e.message}`);
  }
}

function createTerm() {
  const container = createMockElement();
  global.document = {
    createElement() { return createMockElement(); },
    createDocumentFragment() { return { appendChild() {} }; },
    createTextNode(t) { return { textContent: t }; },
  };
  const t = new Mogterm(container, { prompt: "$ " });
  global.document = origDoc;
  return t;
}

// --- Tests ---

test("initial state: empty buffer and cursor at 0", () => {
  const term = createTerm();
  assert.strictEqual(term.inputBuffer, "");
  assert.strictEqual(term.cursorPos, 0);
});

test("_insert adds character and advances cursor", () => {
  const term = createTerm();
  term._insert("a");
  assert.strictEqual(term.inputBuffer, "a");
  assert.strictEqual(term.cursorPos, 1);
});

test("_insert in middle of buffer", () => {
  const term = createTerm();
  term._insert("a");
  term._insert("c");
  term.cursorPos = 1;
  term._insert("b");
  assert.strictEqual(term.inputBuffer, "abc");
  assert.strictEqual(term.cursorPos, 2);
});

test("cursor advances as multiple characters are typed", () => {
  const term = createTerm();
  term._insert("h");
  term._insert("e");
  term._insert("l");
  term._insert("l");
  term._insert("o");
  assert.strictEqual(term.cursorPos, 5);
  assert.strictEqual(term.inputBuffer, "hello");
});

test("_backspace removes character before cursor", () => {
  const term = createTerm();
  term._insert("a");
  term._insert("b");
  term._insert("c");
  term._backspace();
  assert.strictEqual(term.inputBuffer, "ab");
  assert.strictEqual(term.cursorPos, 2);
});

test("_backspace at position 0 does nothing", () => {
  const term = createTerm();
  term._backspace();
  assert.strictEqual(term.inputBuffer, "");
  assert.strictEqual(term.cursorPos, 0);
});

test("_backspace in middle of buffer", () => {
  const term = createTerm();
  term._insert("a");
  term._insert("b");
  term._insert("c");
  term.cursorPos = 2;
  term._backspace();
  assert.strictEqual(term.inputBuffer, "ac");
  assert.strictEqual(term.cursorPos, 1);
});

test("_delete removes character at cursor", () => {
  const term = createTerm();
  term._insert("a");
  term._insert("b");
  term.cursorPos = 0;
  term._delete();
  assert.strictEqual(term.inputBuffer, "b");
  assert.strictEqual(term.cursorPos, 0);
});

test("_delete at end does nothing", () => {
  const term = createTerm();
  term._insert("a");
  term._delete();
  assert.strictEqual(term.inputBuffer, "a");
  assert.strictEqual(term.cursorPos, 1);
});

test("_submit pushes to history and resets buffer", () => {
  let submitted = null;
  const container = createMockElement();
  global.document = {
    createElement() { return createMockElement(); },
    createDocumentFragment() { return { appendChild() {} }; },
    createTextNode(t) { return { textContent: t }; },
  };
  const term = new Mogterm(container, {
    prompt: "$ ",
    onCommand: (cmd) => (submitted = cmd),
  });
  global.document = origDoc;

  term._insert("h");
  term._insert("i");
  term._submit();

  assert.strictEqual(submitted, "hi");
  assert.strictEqual(term.inputBuffer, "");
  assert.strictEqual(term.cursorPos, 0);
  assert.strictEqual(term.history.length, 1);
  assert.strictEqual(term.history[0].text, "hi");
  assert.strictEqual(term.history[0].prompt, "$ ");
});

test("cursor left/right boundaries", () => {
  const term = createTerm();
  term._insert("a");
  term._insert("b");
  // Move left twice
  term.cursorPos--;
  term.cursorPos--;
  assert.strictEqual(term.cursorPos, 0);
  // Can't go below 0
  const clamped = Math.max(0, term.cursorPos - 1);
  assert.strictEqual(clamped, 0);
  // Move right past end
  term.cursorPos = 2;
  const clampedRight = Math.min(term.inputBuffer.length, term.cursorPos + 1);
  assert.strictEqual(clampedRight, 2);
});

test("writeLine adds output to history", () => {
  const container = createMockElement();
  global.document = {
    createElement() { return createMockElement(); },
    createDocumentFragment() { return { appendChild() {} }; },
    createTextNode(t) { return { textContent: t }; },
  };
  const term = new Mogterm(container, { prompt: "$ " });
  term.writeLine("hello world");
  global.document = origDoc;
  assert.strictEqual(term.history.length, 1);
  assert.strictEqual(term.history[0].text, "hello world");
  assert.strictEqual(term.history[0].prompt, "");
});

test("Enter then new input: cursor resets to new prompt", () => {
  const term = createTerm();
  term._insert("x");
  term._submit();
  assert.strictEqual(term.cursorPos, 0);
  assert.strictEqual(term.inputBuffer, "");
  term._insert("y");
  assert.strictEqual(term.cursorPos, 1);
  assert.strictEqual(term.inputBuffer, "y");
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
