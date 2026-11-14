// Compact pure-TypeScript QR Code generator (Byte mode, ECC Level M, Versions 1-10)

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecCount: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return res.slice(data.length);
}

interface VersionSpec {
  version: number;
  dataCodewords: number;
  ecPerBlock: number;
  blocks: number;
  align: number[];
}

// ECC Level M specs for versions 1-10
const VERSION_SPECS: VersionSpec[] = [
  { version: 1, dataCodewords: 16, ecPerBlock: 10, blocks: 1, align: [] },
  { version: 2, dataCodewords: 28, ecPerBlock: 16, blocks: 1, align: [6, 18] },
  { version: 3, dataCodewords: 44, ecPerBlock: 26, blocks: 1, align: [6, 22] },
  { version: 4, dataCodewords: 64, ecPerBlock: 18, blocks: 2, align: [6, 26] },
  { version: 5, dataCodewords: 86, ecPerBlock: 24, blocks: 2, align: [6, 30] },
  { version: 6, dataCodewords: 108, ecPerBlock: 16, blocks: 4, align: [6, 34] },
  { version: 7, dataCodewords: 124, ecPerBlock: 18, blocks: 4, align: [6, 22, 38] },
  { version: 8, dataCodewords: 154, ecPerBlock: 22, blocks: 4, align: [6, 24, 42] },
  { version: 9, dataCodewords: 182, ecPerBlock: 22, blocks: 5, align: [6, 26, 46] },
  { version: 10, dataCodewords: 216, ecPerBlock: 26, blocks: 5, align: [6, 28, 50] },
];

function computeFormatInfo(mask: number): number {
  // ECC Level M = 00
  const data = (0 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionInfo(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) rem ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | rem;
}

export function generateQrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text);
  const spec = VERSION_SPECS.find((v) => {
    const headerBits = 4 + (v.version >= 10 ? 16 : 8);
    return Math.ceil((headerBits + bytes.length * 8 + 4) / 8) <= v.dataCodewords;
  });
  if (!spec) return null;

  // Build bit stream
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, spec.version >= 10 ? 16 : 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = spec.dataCodewords * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < spec.dataCodewords; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) val = (val << 1) | bits[i * 8 + b];
    dataBytes[i] = val;
  }

  // Split into blocks & encode ECC
  const baseBlockSize = Math.floor(spec.dataCodewords / spec.blocks);
  const extraBlocks = spec.dataCodewords % spec.blocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < spec.blocks; b++) {
    const size = baseBlockSize + (b >= spec.blocks - extraBlocks ? 1 : 0);
    const slice = dataBytes.slice(offset, offset + size);
    offset += size;
    dataBlocks.push(slice);
    ecBlocks.push(rsEncode(slice, spec.ecPerBlock));
  }

  const codewords: number[] = [];
  const maxDataLen = baseBlockSize + (extraBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) codewords.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const blk of ecBlocks) {
      codewords.push(blk[i]);
    }
  }

  const size = spec.version * 4 + 17;
  const grid: number[][] = Array.from({ length: size }, () => Array(size).fill(-1));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: number, isReserved = true) => {
    grid[r][c] = val;
    if (isReserved) reserved[r][c] = true;
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const val =
          inBox &&
          (dr === 0 ||
            dr === 6 ||
            dc === 0 ||
            dc === 6 ||
            (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
            ? 1
            : 0;
        setModule(r, c, val);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  for (const r of spec.align) {
    for (const c of spec.align) {
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0) ? 1 : 0;
          setModule(r + dr, c + dc, val);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) setModule(6, i, i % 2 === 0 ? 1 : 0);
    if (!reserved[i][6]) setModule(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module & reserve format areas
  setModule(size - 8, 8, 1);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }

  // Version info for >= 7
  if (spec.version >= 7) {
    const vInfo = computeVersionInfo(spec.version);
    for (let i = 0; i < 18; i++) {
      const bit = (vInfo >> i) & 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      setModule(r, c, bit);
      setModule(c, r, bit);
    }
  }

  // Place data bits (mask 0: (r + c) % 2 === 0 for simplicity and reliability)
  const cwBits: number[] = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) cwBits.push((cw >> b) & 1);
  }

  let bitIdx = 0;
  let up = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col--;
    for (let rowOffset = 0; rowOffset < size; rowOffset++) {
      const r = up ? size - 1 - rowOffset : rowOffset;
      for (const c of [col, col - 1]) {
        if (!reserved[r][c]) {
          const rawBit = bitIdx < cwBits.length ? cwBits[bitIdx++] : 0;
          const masked = (r + c) % 2 === 0 ? rawBit ^ 1 : rawBit;
          grid[r][c] = masked;
        }
      }
    }
    up = !up;
  }

  // Write format info for mask 0
  const fmt = computeFormatInfo(0);
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    if (i < 6) grid[i][8] = bit;
    else if (i < 8) grid[i + 1][8] = bit;
    else grid[size - 15 + i][8] = bit;

    if (i < 8) grid[8][size - 1 - i] = bit;
    else if (i < 9) grid[8][15 - i] = bit;
    else grid[8][14 - i] = bit;
  }

  return grid.map((row) => row.map((cell) => cell === 1));
}
