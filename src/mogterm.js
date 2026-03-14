/**
 * Mogterm — a minimal terminal emulator component.
 *
 * All typing happens inline within the terminal window. There is no separate
 * input element; the terminal div itself captures keyboard events.
 */
class Mogterm {
  /**
   * @param {HTMLElement} container - the DOM element to mount into
   * @param {object}      [opts]
   * @param {string}      [opts.prompt='$ ']
   * @param {function}    [opts.onCommand] - called with the entered command string
   */
  constructor(container, opts = {}) {
    this.prompt = opts.prompt ?? "$ ";
    this.onCommand = opts.onCommand ?? (() => {});

    this.inputBuffer = "";
    this.cursorPos = 0;
    this.history = []; // array of { prompt: string, text: string } for completed lines

    // Build DOM
    this.el = document.createElement("div");
    this.el.classList.add("mogterm");
    this.el.setAttribute("tabindex", "0");
    container.appendChild(this.el);

    // Bind events
    this.el.addEventListener("keydown", (e) => this._onKeyDown(e));
    this.el.addEventListener("focus", () => this._onFocus());
    this.el.addEventListener("blur", () => this._onBlur());
    this.el.addEventListener("click", () => this.el.focus());

    this._render();
  }

  /* ------------------------------------------------------------------ */
  /*  Public helpers                                                     */
  /* ------------------------------------------------------------------ */

  /** Write a line of output (not user input) to the terminal. */
  writeLine(text) {
    this.history.push({ prompt: "", text });
    this._render();
  }

  /** Focus the terminal programmatically. */
  focus() {
    this.el.focus();
  }

  /* ------------------------------------------------------------------ */
  /*  Event handlers                                                    */
  /* ------------------------------------------------------------------ */

  _onFocus() {
    this.el.classList.add("focused");
    this._render();
  }

  _onBlur() {
    this.el.classList.remove("focused");
    this._render();
  }

  _onKeyDown(e) {
    // Ignore modifier-only or ctrl/meta combos (except ctrl+c)
    if (e.key === "Shift" || e.key === "Alt" || e.key === "Meta" || e.key === "Control") {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Allow ctrl+c to clear current line
      if (e.key === "c") {
        e.preventDefault();
        this.history.push({ prompt: this.prompt, text: this.inputBuffer + "^C" });
        this.inputBuffer = "";
        this.cursorPos = 0;
        this._render();
      }
      return;
    }

    e.preventDefault();

    switch (e.key) {
      case "Enter":
        this._submit();
        break;
      case "Backspace":
        this._backspace();
        break;
      case "Delete":
        this._delete();
        break;
      case "ArrowLeft":
        if (this.cursorPos > 0) this.cursorPos--;
        break;
      case "ArrowRight":
        if (this.cursorPos < this.inputBuffer.length) this.cursorPos++;
        break;
      case "Home":
        this.cursorPos = 0;
        break;
      case "End":
        this.cursorPos = this.inputBuffer.length;
        break;
      default:
        if (e.key.length === 1) {
          this._insert(e.key);
        }
        break;
    }

    this._render();
  }

  /* ------------------------------------------------------------------ */
  /*  Input manipulation                                                */
  /* ------------------------------------------------------------------ */

  _insert(ch) {
    this.inputBuffer =
      this.inputBuffer.slice(0, this.cursorPos) + ch + this.inputBuffer.slice(this.cursorPos);
    this.cursorPos++;
  }

  _backspace() {
    if (this.cursorPos === 0) return;
    this.inputBuffer =
      this.inputBuffer.slice(0, this.cursorPos - 1) + this.inputBuffer.slice(this.cursorPos);
    this.cursorPos--;
  }

  _delete() {
    if (this.cursorPos >= this.inputBuffer.length) return;
    this.inputBuffer =
      this.inputBuffer.slice(0, this.cursorPos) + this.inputBuffer.slice(this.cursorPos + 1);
  }

  _submit() {
    const cmd = this.inputBuffer;
    this.history.push({ prompt: this.prompt, text: cmd });
    this.inputBuffer = "";
    this.cursorPos = 0;
    this.onCommand(cmd);
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                         */
  /* ------------------------------------------------------------------ */

  _render() {
    const frag = document.createDocumentFragment();

    // Render history lines
    for (const line of this.history) {
      const span = document.createElement("span");
      span.classList.add("mogterm-line");
      if (line.prompt) {
        const ps = document.createElement("span");
        ps.classList.add("mogterm-prompt");
        ps.textContent = line.prompt;
        span.appendChild(ps);
      }
      span.appendChild(document.createTextNode(line.text + "\n"));
      frag.appendChild(span);
    }

    // Render active prompt line with inline cursor
    const activeLine = document.createElement("span");
    activeLine.classList.add("mogterm-line");

    const ps = document.createElement("span");
    ps.classList.add("mogterm-prompt");
    ps.textContent = this.prompt;
    activeLine.appendChild(ps);

    const before = this.inputBuffer.slice(0, this.cursorPos);
    const cursorChar = this.inputBuffer[this.cursorPos] ?? " ";
    const after = this.inputBuffer.slice(this.cursorPos + 1);

    activeLine.appendChild(document.createTextNode(before));

    const cursor = document.createElement("span");
    cursor.classList.add("mogterm-cursor");
    cursor.textContent = cursorChar;
    activeLine.appendChild(cursor);

    if (after) {
      activeLine.appendChild(document.createTextNode(after));
    }

    frag.appendChild(activeLine);

    this.el.innerHTML = "";
    this.el.appendChild(frag);

    // Keep scrolled to bottom
    this.el.scrollTop = this.el.scrollHeight;
  }
}

// Support both module and script-tag usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = Mogterm;
}
