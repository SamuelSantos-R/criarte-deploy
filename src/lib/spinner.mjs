// ============================================================================
// SPINNER — Animação de carregamento estilo Ora (leve, sem dependência)
// ============================================================================
import { c } from "./config.mjs";

const FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

export class Spinner {
  constructor(text) {
    this.text = text;
    this.i = 0;
    this.iv = null;
    this.startTime = Date.now();
  }
  start() {
    if (!process.stdout.isTTY) {
      console.log(`${c.cyan}…${c.reset} ${this.text}`);
      return this;
    }
    process.stdout.write("\x1b[?25l");
    this.iv = setInterval(() => {
      process.stdout.write(`\r${c.cyan}${FRAMES[this.i = (this.i + 1) % FRAMES.length]}${c.reset} ${this.text}   `);
    }, 80);
    return this;
  }
  update(text) {
    this.text = text;
  }
  stop(symbol = "✓", color = c.green, finalText) {
    if (this.iv) clearInterval(this.iv);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[2K\r");
      process.stdout.write("\x1b[?25h");
    }
    console.log(`${color}${symbol}${c.reset} ${finalText ?? this.text} ${c.dim}(${elapsed}s)${c.reset}`);
  }
  succeed(text) { this.stop("✓", c.green, text); }
  fail(text)    { this.stop("✗", c.red, text); }
  warn(text)    { this.stop("⚠", c.yellow, text); }
  clear() {
    if (this.iv) clearInterval(this.iv);
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b[2K\r\x1b[?25h");
    }
  }
}
