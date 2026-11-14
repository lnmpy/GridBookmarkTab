export interface EvaluatedLine {
  raw: string;
  value: number | null;
  formatted: string;
  isComment: boolean;
  isError: boolean;
  variableName?: string;
}

const MAX_DISPLAY_DECIMALS = 10;
const DIV_INTERNAL_SCALE = 20;

export class BigDecimal {
  readonly coeff: bigint;
  readonly scale: number;

  constructor(coeff: bigint, scale = 0) {
    if (coeff === 0n) {
      this.coeff = 0n;
      this.scale = 0;
      return;
    }
    let c = coeff;
    let s = scale;
    while (s > 0 && c % 10n === 0n) {
      c /= 10n;
      s--;
    }
    if (s < 0) {
      c *= 10n ** BigInt(-s);
      s = 0;
    }
    this.coeff = c;
    this.scale = s;
  }

  static fromNumber(n: number): BigDecimal {
    if (!Number.isFinite(n)) {
      throw new Error('Non-finite number');
    }
    // Avoid scientific notation artifacts for normal numbers
    return BigDecimal.fromString(n.toString());
  }

  static fromString(raw: string): BigDecimal {
    const clean = raw.replace(/[,_]/g, '').trim();
    if (!clean) throw new Error('Empty number');

    // Support scientific notation like 1.5e-8 or 2e10
    const sciMatch = clean.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
    if (sciMatch) {
      const base = BigDecimal.fromString(sciMatch[1]);
      const exp = parseInt(sciMatch[2], 10);
      return new BigDecimal(base.coeff, base.scale - exp);
    }

    const match = clean.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
    if (!match || (!match[2] && !match[3])) {
      throw new Error(`Invalid number: ${raw}`);
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const intPart = match[2] || '0';
    const fracPart = match[3] || '';
    const digits = intPart + fracPart;
    return new BigDecimal(sign * BigInt(digits), fracPart.length);
  }

  negate(): BigDecimal {
    return new BigDecimal(-this.coeff, this.scale);
  }

  abs(): BigDecimal {
    return this.coeff < 0n ? this.negate() : this;
  }

  add(other: BigDecimal): BigDecimal {
    const targetScale = Math.max(this.scale, other.scale);
    const a = this.coeff * 10n ** BigInt(targetScale - this.scale);
    const b = other.coeff * 10n ** BigInt(targetScale - other.scale);
    return new BigDecimal(a + b, targetScale);
  }

  sub(other: BigDecimal): BigDecimal {
    return this.add(other.negate());
  }

  mul(other: BigDecimal): BigDecimal {
    return new BigDecimal(this.coeff * other.coeff, this.scale + other.scale);
  }

  div(other: BigDecimal): BigDecimal {
    if (other.coeff === 0n) {
      throw new Error('Division by zero');
    }
    const extraScale = DIV_INTERNAL_SCALE + other.scale - this.scale;
    let num = this.coeff;
    let den = other.coeff;
    if (extraScale >= 0) {
      num *= 10n ** BigInt(extraScale);
    } else {
      den *= 10n ** BigInt(-extraScale);
    }
    const quotient = num / den;
    const remainder = num % den;
    // Round half away from zero at DIV_INTERNAL_SCALE
    const absRem = remainder < 0n ? -remainder : remainder;
    const absDen = den < 0n ? -den : den;
    let rounded = quotient;
    if (absRem * 2n >= absDen) {
      rounded += (num >= 0n) === (den >= 0n) ? 1n : -1n;
    }
    return new BigDecimal(rounded, DIV_INTERNAL_SCALE);
  }

  pow(other: BigDecimal): BigDecimal {
    if (other.scale === 0) {
      const exp = Number(other.coeff);
      if (Number.isInteger(exp) && exp >= 0 && exp <= 500) {
        return new BigDecimal(this.coeff ** BigInt(exp), this.scale * exp);
      }
      if (Number.isInteger(exp) && exp < 0 && exp >= -500) {
        const pos = new BigDecimal(this.coeff ** BigInt(-exp), this.scale * -exp);
        return new BigDecimal(1n, 0).div(pos);
      }
    }
    return BigDecimal.fromNumber(Math.pow(this.toNumber(), other.toNumber()));
  }

  roundTo(decimals: number): BigDecimal {
    if (this.scale <= decimals) return this;
    const drop = this.scale - decimals;
    const factor = 10n ** BigInt(drop);
    const q = this.coeff / factor;
    const r = this.coeff % factor;
    const absR = r < 0n ? -r : r;
    let rounded = q;
    if (absR * 2n >= factor) {
      rounded += this.coeff >= 0n ? 1n : -1n;
    }
    return new BigDecimal(rounded, decimals);
  }

  floor(): BigDecimal {
    if (this.scale === 0) return this;
    const factor = 10n ** BigInt(this.scale);
    let q = this.coeff / factor;
    const r = this.coeff % factor;
    if (r < 0n) q -= 1n;
    return new BigDecimal(q, 0);
  }

  ceil(): BigDecimal {
    if (this.scale === 0) return this;
    const factor = 10n ** BigInt(this.scale);
    let q = this.coeff / factor;
    const r = this.coeff % factor;
    if (r > 0n) q += 1n;
    return new BigDecimal(q, 0);
  }

  compare(other: BigDecimal): number {
    const diff = this.sub(other);
    if (diff.coeff > 0n) return 1;
    if (diff.coeff < 0n) return -1;
    return 0;
  }

  toNumber(): number {
    return Number(this.toPlainString());
  }

  toPlainString(): string {
    if (this.coeff === 0n) return '0';
    const negative = this.coeff < 0n;
    const absStr = (negative ? -this.coeff : this.coeff).toString();
    if (this.scale === 0) {
      return negative ? `-${absStr}` : absStr;
    }
    const padded = absStr.padStart(this.scale + 1, '0');
    const splitIdx = padded.length - this.scale;
    const intPart = padded.slice(0, splitIdx);
    const fracPart = padded.slice(splitIdx).replace(/0+$/, '');
    const body = fracPart ? `${intPart}.${fracPart}` : intPart;
    return negative ? `-${body}` : body;
  }
}

const HUNDRED = new BigDecimal(100n, 0);

const MATH_CONSTANTS: Record<string, BigDecimal> = {
  pi: BigDecimal.fromString('3.141592653589793'),
  e: BigDecimal.fromString('2.718281828459045'),
};

const MATH_FUNCTIONS: Record<string, (...args: BigDecimal[]) => BigDecimal> = {
  sqrt: (x) => BigDecimal.fromNumber(Math.sqrt(x.toNumber())),
  abs: (x) => x.abs(),
  round: (x, d = new BigDecimal(0n, 0)) => x.roundTo(Math.max(0, Math.trunc(d.toNumber()))),
  floor: (x) => x.floor(),
  ceil: (x) => x.ceil(),
  min: (...args) =>
    args.reduce((m, v) => (v.compare(m) < 0 ? v : m)),
  max: (...args) =>
    args.reduce((m, v) => (v.compare(m) > 0 ? v : m)),
  pow: (a, b) => a.pow(b),
  log: (x) => BigDecimal.fromNumber(Math.log10(x.toNumber())),
  ln: (x) => BigDecimal.fromNumber(Math.log(x.toNumber())),
  sin: (x) => BigDecimal.fromNumber(Math.sin(x.toNumber())),
  cos: (x) => BigDecimal.fromNumber(Math.cos(x.toNumber())),
  tan: (x) => BigDecimal.fromNumber(Math.tan(x.toNumber())),
  sum: (...args) => args.reduce((acc, v) => acc.add(v), new BigDecimal(0n, 0)),
  avg: (...args) =>
    args.length === 0
      ? new BigDecimal(0n, 0)
      : args
          .reduce((acc, v) => acc.add(v), new BigDecimal(0n, 0))
          .div(new BigDecimal(BigInt(args.length), 0)),
};

class ExpressionParser {
  private pos = 0;

  constructor(
    private readonly input: string,
    private readonly vars: Record<string, BigDecimal>,
  ) {}

  parse(): BigDecimal {
    const val = this.parseAddSub();
    this.skipWhitespace();
    if (this.pos < this.input.length) {
      throw new Error(`Unexpected token: ${this.input[this.pos]}`);
    }
    return val;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private peek(): string {
    this.skipWhitespace();
    return this.input[this.pos] ?? '';
  }

  private parseAddSub(): BigDecimal {
    let left = this.parseMulDiv();
    while (true) {
      const ch = this.peek();
      if (ch === '+' || ch === '-') {
        this.pos++;
        const rightStart = this.pos;
        const right = this.parseMulDiv();
        // Support "100 + 20%" => 120, "100 - 15%" => 85
        const slice = this.input.slice(rightStart, this.pos).trim();
        if (slice.endsWith('%')) {
          const delta = left.mul(right);
          left = ch === '+' ? left.add(delta) : left.sub(delta);
        } else {
          left = ch === '+' ? left.add(right) : left.sub(right);
        }
      } else {
        break;
      }
    }
    return left;
  }

  private parseMulDiv(): BigDecimal {
    let left = this.parsePower();
    while (true) {
      const ch = this.peek();
      if (ch === '*' || ch === '/' || ch === '×' || ch === '÷') {
        this.pos++;
        const right = this.parsePower();
        if (ch === '*' || ch === '×') {
          left = left.mul(right);
        } else {
          left = left.div(right);
        }
      } else {
        break;
      }
    }
    return left;
  }

  private parsePower(): BigDecimal {
    let base = this.parseUnary();
    if (this.peek() === '^') {
      this.pos++;
      const exp = this.parsePower();
      base = base.pow(exp);
    }
    return base;
  }

  private parseUnary(): BigDecimal {
    const ch = this.peek();
    if (ch === '-') {
      this.pos++;
      return this.parseUnary().negate();
    }
    if (ch === '+') {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  private parsePostfix(): BigDecimal {
    let val = this.parsePrimary();
    while (this.peek() === '%') {
      this.pos++;
      val = val.div(HUNDRED);
    }
    return val;
  }

  private parsePrimary(): BigDecimal {
    const ch = this.peek();

    if (ch === '(') {
      this.pos++;
      const val = this.parseAddSub();
      if (this.peek() !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      this.pos++;
      return val;
    }

    // Strip leading currency symbols if attached to a number
    if (ch === '$' || ch === '¥' || ch === '€' || ch === '£') {
      this.pos++;
      return this.parsePrimary();
    }

    // Number literal (with optional thousands commas like 1,200)
    if (/[0-9.]/.test(ch)) {
      const start = this.pos;
      while (this.pos < this.input.length) {
        const c = this.input[this.pos];
        if (/[0-9._]/.test(c)) {
          this.pos++;
        } else if (
          c === ',' &&
          /^[0-9]{3}(?![0-9])/.test(this.input.slice(this.pos + 1))
        ) {
          this.pos++;
        } else {
          break;
        }
      }
      const numStr = this.input.slice(start, this.pos);
      return BigDecimal.fromString(numStr);
    }

    // Identifier (variable, constant, or function call)
    if (/[a-zA-Z_\u4e00-\u9fa5]/.test(ch)) {
      const start = this.pos;
      while (
        this.pos < this.input.length &&
        /[a-zA-Z0-9_\u4e00-\u9fa5]/.test(this.input[this.pos])
      ) {
        this.pos++;
      }
      const ident = this.input.slice(start, this.pos);
      const lower = ident.toLowerCase();

      // Function call
      if (this.peek() === '(') {
        this.pos++;
        const args: BigDecimal[] = [];
        if (this.peek() !== ')') {
          args.push(this.parseAddSub());
          while (this.peek() === ',') {
            this.pos++;
            args.push(this.parseAddSub());
          }
        }
        if (this.peek() !== ')') {
          throw new Error('Missing closing parenthesis');
        }
        this.pos++;
        const fn = MATH_FUNCTIONS[lower];
        if (!fn) {
          throw new Error(`Unknown function: ${ident}`);
        }
        return fn(...args);
      }

      if (ident in this.vars) {
        return this.vars[ident];
      }
      if (lower in this.vars) {
        return this.vars[lower];
      }
      if (lower in MATH_CONSTANTS) {
        return MATH_CONSTANTS[lower];
      }
      throw new Error(`Unknown variable: ${ident}`);
    }

    throw new Error(`Unexpected character: ${ch || 'EOF'}`);
  }
}

export function formatBigDecimal(dec: BigDecimal): string {
  const rounded = dec.roundTo(MAX_DISPLAY_DECIMALS);
  const plain = rounded.toPlainString();
  const negative = plain.startsWith('-');
  const unsigned = negative ? plain.slice(1) : plain;
  const [intPart, fracPart] = unsigned.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const joined = fracPart ? `${formattedInt}.${fracPart}` : formattedInt;
  return negative ? `-${joined}` : joined;
}

export function formatCalculatorResult(num: number): string {
  if (!Number.isFinite(num)) return 'Error';
  return formatBigDecimal(BigDecimal.fromNumber(num));
}

export function evaluateCalculatorDocument(text: string): {
  lines: EvaluatedLine[];
  total: number;
} {
  const rawLines = text.split('\n');
  const vars: Record<string, BigDecimal> = {};
  const previousResults: BigDecimal[] = [];
  let runningSum = new BigDecimal(0n, 0);

  const lines: EvaluatedLine[] = rawLines.map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { raw, value: null, formatted: '', isComment: false, isError: false };
    }

    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return { raw, value: null, formatted: '', isComment: true, isError: false };
    }

    // Strip inline comment (// or #)
    const commentStripped = trimmed
      .replace(/\s+\/\/.*$/, '')
      .replace(/\s+#.*$/, '')
      .trim();

    if (!commentStripped) {
      return { raw, value: null, formatted: '', isComment: true, isError: false };
    }

    // Check variable assignment: "name = expr"
    let variableName: string | undefined;
    let expr = commentStripped;
    const assignMatch = commentStripped.match(
      /^([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\s*=\s*(.+)$/,
    );
    if (assignMatch) {
      variableName = assignMatch[1];
      expr = assignMatch[2].trim();
    }

    // Support "20% of 500" syntax
    expr = expr.replace(/(\d+(?:\.\d+)?)%\s+of\s+/gi, '($1%)*');

    // Expose dynamic context variables: sum, total, avg, prev, last
    const contextVars: Record<string, BigDecimal> = {
      ...vars,
      sum: runningSum,
      total: runningSum,
      avg:
        previousResults.length > 0
          ? runningSum.div(new BigDecimal(BigInt(previousResults.length), 0))
          : new BigDecimal(0n, 0),
      prev:
        previousResults.length > 0
          ? previousResults[previousResults.length - 1]
          : new BigDecimal(0n, 0),
      last:
        previousResults.length > 0
          ? previousResults[previousResults.length - 1]
          : new BigDecimal(0n, 0),
    };

    try {
      const dec = new ExpressionParser(expr, contextVars).parse();
      if (variableName) {
        vars[variableName] = dec;
      }
      previousResults.push(dec);
      runningSum = runningSum.add(dec);
      return {
        raw,
        value: dec.toNumber(),
        formatted: formatBigDecimal(dec),
        isComment: false,
        isError: false,
        variableName,
      };
    } catch {
      return {
        raw,
        value: null,
        formatted: '',
        isComment: false,
        isError: false,
      };
    }
  });

  return { lines, total: runningSum.toNumber() };
}
