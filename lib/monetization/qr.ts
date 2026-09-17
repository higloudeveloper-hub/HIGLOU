/**
 * Compact QR (byte mode) → SVG for short https URLs such as /go/{slug}.
 * ECC level L, version auto 2–4. No external dependency.
 */

const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number) {
  if (!a || !b) return 0;
  return EXP[(LOG[a] + LOG[b]) % 255];
}

function rsPoly(nsym: number) {
  let g = [1];
  for (let i = 0; i < nsym; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= gfMul(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}

function rsEncode(msg: number[], nsym: number) {
  const gen = rsPoly(nsym);
  const out = msg.concat(new Array(nsym).fill(0));
  for (let i = 0; i < msg.length; i++) {
    const coef = out[i];
    if (!coef) continue;
    for (let j = 0; j < gen.length; j++) {
      out[i + j] ^= gfMul(gen[j], coef);
    }
  }
  return out.slice(msg.length);
}

type QrVersion = { version: number; size: number; dataCW: number; ecCW: number };

const VERSIONS: QrVersion[] = [
  { version: 2, size: 25, dataCW: 34, ecCW: 10 },
  { version: 3, size: 29, dataCW: 55, ecCW: 15 },
  { version: 4, size: 33, dataCW: 80, ecCW: 20 },
];

function bitBuffer() {
  const bits: number[] = [];
  return {
    bits,
    put(val: number, len: number) {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    },
    toBytes() {
      const bytes: number[] = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
        bytes.push(v);
      }
      return bytes;
    },
  };
}

function placeFinders(mod: number[][], size: number) {
  const draw = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const xx = ox + x;
        const yy = oy + y;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const inCore = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const dark =
          inCore &&
          (x === 0 ||
            x === 6 ||
            y === 0 ||
            y === 6 ||
            (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        mod[yy][xx] = dark ? 1 : 0;
      }
    }
  };
  draw(0, 0);
  draw(size - 7, 0);
  draw(0, size - 7);
}

export function buildQrSvg(
  text: string,
  modulePx = 5,
): { ok: true; svg: string } | { ok: false; error: string } {
  const raw = String(text || "");
  if (!raw) return { ok: false, error: "Empty QR payload" };
  const data = Array.from(new TextEncoder().encode(raw));
  if (data.length > 70) {
    return { ok: false, error: "QR payload too long" };
  }

  const ver =
    VERSIONS.find((v) => data.length + 3 <= v.dataCW) || VERSIONS[VERSIONS.length - 1];
  const size = ver.size;
  const buf = bitBuffer();
  buf.put(0b0100, 4);
  buf.put(data.length, 8);
  for (const b of data) buf.put(b, 8);
  buf.put(0, 4);
  while (buf.bits.length % 8) buf.put(0, 1);
  const codewords = buf.toBytes();
  const pads = [0xec, 0x11];
  let pi = 0;
  while (codewords.length < ver.dataCW) {
    codewords.push(pads[pi % 2]);
    pi++;
  }
  const ec = rsEncode(codewords.slice(0, ver.dataCW), ver.ecCW);
  const allBits = bitBuffer();
  for (const c of codewords.slice(0, ver.dataCW).concat(ec)) {
    allBits.put(c, 8);
  }

  const mod: number[][] = Array.from({ length: size }, () =>
    Array(size).fill(-1),
  );
  placeFinders(mod, size);
  for (let i = 8; i < size - 8; i++) {
    if (mod[6][i] === -1) mod[6][i] = i % 2 === 0 ? 1 : 0;
    if (mod[i][6] === -1) mod[i][6] = i % 2 === 0 ? 1 : 0;
  }

  let bi = 0;
  let up = true;
  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x -= 1;
    for (let i = 0; i < size; i++) {
      const y = up ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const xx = x - dx;
        if (mod[y][xx] !== -1) continue;
        const bit = allBits.bits[bi++] ?? 0;
        // mask 0: (x+y)%2 == 0 flip
        const masked = bit ^ ((xx + y) % 2 === 0 ? 1 : 0);
        mod[y][xx] = masked;
      }
    }
    up = !up;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mod[y][x] === -1) mod[y][x] = 0;
    }
  }

  const quiet = 2;
  const dim = (size + quiet * 2) * modulePx;
  let body = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mod[y][x]) continue;
      body += `<rect x="${(x + quiet) * modulePx}" y="${(y + quiet) * modulePx}" width="${modulePx}" height="${modulePx}" fill="#111"/>`;
    }
  }
  return {
    ok: true,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/>${body}</svg>`,
  };
}

export function qrSvgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
