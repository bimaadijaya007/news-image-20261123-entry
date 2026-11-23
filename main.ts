// The World in One Day - 23 November 2026.
// One 1024x1024 PNG summarising the day's world news in eight cards.
// Stdlib only. Deterministic: same bytes every run, no timestamps, no network.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

const PAPER: RGB = [246, 241, 231];
const INK: RGB = [26, 26, 26];
const CARD: RGB = [255, 255, 255];
const NAVY: RGB = [20, 33, 61];
const MUTED: RGB = [107, 114, 128];
const RULE: RGB = [216, 210, 196];
const GOLD: RGB = [201, 162, 39];
const WHITE: RGB = [255, 255, 255];
const FAINT: RGB = [156, 163, 175];
const FLAME: RGB = [234, 88, 12];

const px = new Uint8Array(W * H * 3);

function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(xx, yy, c);
  }
}

function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = x0; x <= x1; x++) set(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) set(x, y, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    set(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  let x = r;
  let y = 0;
  let err = 0;
  while (x >= y) {
    set(cx + x, cy + y, c);
    set(cx + y, cy + x, c);
    set(cx - y, cy + x, c);
    set(cx - x, cy + y, c);
    set(cx - x, cy - y, c);
    set(cx - y, cy - x, c);
    set(cx + y, cy - x, c);
    set(cx + x, cy - y, c);
    y += 1;
    if (err <= 0) err += 2 * y + 1;
    if (err > 0) {
      x -= 1;
      err -= 2 * x + 1;
    }
  }
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -hw; x <= hw; x++) set(cx + x, cy + y, c);
  }
}

function halfDisc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= 0; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -hw; x <= hw; x++) set(cx + x, cy + y, c);
  }
}

function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) set(x, y, c);
    }
  }
}

// ---- PNG encoder (hand-rolled: CRC32 + chunk framing + zlib stdlib) ----

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- 5x7 bitmap font, written as string art ("#" = on) ----

const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["#...#", "#..#.", "...#.", "..#..", ".#...", "#..#.", "#...#"],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
};

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(
  s: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  align: "left" | "center" | "right" = "left",
): void {
  const w = textWidth(s, scale);
  let cx = x;
  if (align === "center") cx = x - Math.floor(w / 2);
  if (align === "right") cx = x - w;
  const up = s.toUpperCase(); // the bitmap font only carries A-Z 0-9 + punctuation
  for (const ch of up) {
    const g = FONT[ch] ?? FONT[" "];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === "#") rect(cx + col * scale, y + r * scale, scale, scale, c);
      }
    }
    cx += 6 * scale;
  }
}

// ---- Geometric icons, one per story (own coordinates, 96x96 box) ----

function drawIcon(kind: string, cx: number, top: number, c: RGB): void {
  if (kind === "globe") {
    const cy = top + 48;
    circle(cx, cy, 36, c);
    hline(cx - 36, cx + 36, cy, c);
    hline(cx - 31, cx + 31, cy - 18, c);
    hline(cx - 31, cx + 31, cy + 18, c);
    vline(cx, cy - 36, cy + 36, c);
  } else if (kind === "rocket") {
    rect(cx - 10, top + 22, 20, 44, c);
    poly(
      [
        [cx - 10, top + 22],
        [cx + 10, top + 22],
        [cx, top + 2],
      ],
      c,
    );
    poly(
      [
        [cx - 10, top + 52],
        [cx - 24, top + 72],
        [cx - 10, top + 66],
      ],
      c,
    );
    poly(
      [
        [cx + 10, top + 52],
        [cx + 24, top + 72],
        [cx + 10, top + 66],
      ],
      c,
    );
    disc(cx, top + 38, 6, WHITE);
    circle(cx, top + 38, 6, c);
    poly(
      [
        [cx - 7, top + 66],
        [cx + 7, top + 66],
        [cx, top + 92],
      ],
      FLAME,
    );
  } else if (kind === "drone") {
    rect(cx - 12, top + 42, 24, 12, c);
    line(cx - 10, top + 44, cx - 30, top + 20, c);
    line(cx + 10, top + 44, cx + 30, top + 20, c);
    line(cx - 10, top + 52, cx - 30, top + 76, c);
    line(cx + 10, top + 52, cx + 30, top + 76, c);
    for (const [rx, ry] of [
      [cx - 30, top + 20],
      [cx + 30, top + 20],
      [cx - 30, top + 76],
      [cx + 30, top + 76],
    ] as Array<[number, number]>) {
      circle(rx, ry, 11, c);
      disc(rx, ry, 2, c);
    }
    disc(cx, top + 48, 3, WHITE);
  } else if (kind === "factory") {
    rect(cx - 34, top + 52, 68, 44, c);
    poly(
      [
        [cx - 34, top + 52],
        [cx - 17, top + 34],
        [cx, top + 52],
      ],
      c,
    );
    poly(
      [
        [cx, top + 52],
        [cx + 17, top + 34],
        [cx + 34, top + 52],
      ],
      c,
    );
    rect(cx + 22, top + 18, 10, 34, c);
    poly(
      [
        [cx + 24, top + 18],
        [cx + 30, top + 18],
        [cx + 27, top + 2],
      ],
      FLAME,
    );
    rect(cx - 26, top + 62, 12, 12, WHITE);
    rect(cx - 6, top + 62, 12, 12, WHITE);
    rect(cx + 14, top + 62, 8, 12, WHITE);
  } else if (kind === "capitol") {
    rect(cx - 36, top + 82, 72, 10, c);
    rect(cx - 28, top + 52, 8, 30, c);
    rect(cx - 4, top + 52, 8, 30, c);
    rect(cx + 20, top + 52, 8, 30, c);
    rect(cx - 24, top + 48, 48, 6, c);
    halfDisc(cx, top + 48, 20, c);
    vline(cx, top + 10, top + 28, c);
    rect(cx, top + 10, 12, 7, c);
  } else if (kind === "boat") {
    poly(
      [
        [cx - 36, top + 56],
        [cx + 36, top + 56],
        [cx + 26, top + 76],
        [cx - 26, top + 76],
      ],
      c,
    );
    vline(cx, top + 16, top + 56, c);
    poly(
      [
        [cx + 2, top + 18],
        [cx + 2, top + 54],
        [cx + 30, top + 54],
      ],
      c,
    );
    hline(cx - 30, cx - 10, top + 86, c);
    hline(cx + 4, cx + 30, top + 86, c);
    hline(cx - 18, cx + 18, top + 94, c);
  } else if (kind === "megaphone") {
    poly(
      [
        [cx - 6, top + 34],
        [cx + 30, top + 18],
        [cx + 30, top + 62],
        [cx - 6, top + 46],
      ],
      c,
    );
    rect(cx - 14, top + 46, 10, 22, c);
    rect(cx + 28, top + 16, 5, 48, c);
    line(cx + 42, top + 26, cx + 48, top + 32, c);
    line(cx + 42, top + 54, cx + 48, top + 48, c);
    line(cx + 52, top + 20, cx + 60, top + 30, c);
    line(cx + 52, top + 60, cx + 60, top + 50, c);
  } else if (kind === "gradcap") {
    poly(
      [
        [cx, top + 22],
        [cx + 34, top + 40],
        [cx, top + 58],
        [cx - 34, top + 40],
      ],
      c,
    );
    rect(cx - 18, top + 56, 36, 14, c);
    vline(cx + 34, top + 40, top + 64, c);
    disc(cx + 34, top + 68, 4, GOLD);
  }
}

// ---- The eight stories of Monday 23 November 2026 ----
// Headlines wrap at 12 chars/line (scale 3), subs at 19 chars/line (scale 2).
// All facts verified against Reuters / AP / BBC on the morning of 23 Nov 2026.

type Story = {
  tag: string;
  color: RGB;
  head: string[];
  sub: string[];
  icon: string;
};

const STORIES: Story[] = [
  {
    tag: "CLIMATE",
    color: [15, 118, 110],
    head: ["COP31 ENDS", "WITH NO DEAL"],
    sub: ["Fossil-fuel split", "sinks Antalya talks"],
    icon: "globe",
  },
  {
    tag: "GULF WAR",
    color: [185, 28, 28],
    head: ["WAR WIDENS", "IN THE GULF"],
    sub: ["Iran hits Bahrain;", "Houthis hit Saudi"],
    icon: "rocket",
  },
  {
    tag: "UKRAINE",
    color: [29, 78, 216],
    head: ["KYIV DRONE", "STRIKE"],
    sub: ["3 dead, 14 missing", "in rubble"],
    icon: "drone",
  },
  {
    tag: "INDONESIA",
    color: [180, 83, 9],
    head: ["JAVA FACTORY", "FIRE"],
    sub: ["24 body bags;", "dozens missing"],
    icon: "factory",
  },
  {
    tag: "USA",
    color: [109, 40, 217],
    head: ["DEMOCRATS", "RETAKE HOUSE"],
    sub: ["258 seats, most", "since 1992"],
    icon: "capitol",
  },
  {
    tag: "NIGERIA",
    color: [21, 128, 61],
    head: ["BOAT SINKS,", "24 DEAD"],
    sub: ["Mourners drowned", "on way to funeral"],
    icon: "boat",
  },
  {
    tag: "LISBON",
    color: [190, 24, 93],
    head: ["LISBON", "MARCHES"],
    sub: ["Thousands protest", "cost of living"],
    icon: "megaphone",
  },
  {
    tag: "SOUTH KOREA",
    color: [71, 85, 105],
    head: ["MINISTER", "QUITS", "OVER AI"],
    sub: ["AI exam-cheating", "scandal ends tenure"],
    icon: "gradcap",
  },
];

// ---- Layout ----

const GX = 8;
const GY = 140;
const CW = 246;
const CH = 384;
const GUT = 8;

function drawCard(x: number, y: number, s: Story, n: number): void {
  rect(x, y, CW, CH, CARD);
  rect(x, y, CW, 2, RULE);
  rect(x, y + CH - 2, CW, 2, RULE);
  rect(x, y, 2, CH, RULE);
  rect(x + CW - 2, y, 2, CH, RULE);
  // Tag band.
  rect(x, y, CW, 32, s.color);
  drawText(s.tag, x + CW / 2, y + 9, 2, WHITE, "center");
  // Icon.
  drawIcon(s.icon, x + CW / 2, y + 48, s.color);
  // Headline, scale 3.
  let hy = y + 192;
  for (const ln of s.head) {
    drawText(ln, x + CW / 2, hy, 3, INK, "center");
    hy += 26;
  }
  // Rule under the headline.
  rect(x + CW / 2 - 32, hy + 8, 64, 2, s.color);
  // Sub, scale 2.
  let sy = hy + 22;
  for (const ln of s.sub) {
    drawText(ln, x + CW / 2, sy, 2, MUTED, "center");
    sy += 19;
  }
  // Story number, bottom right.
  drawText(String(n).padStart(2, "0"), x + CW - 12, y + CH - 26, 1, MUTED, "right");
  // Bottom color bar.
  rect(x, y + CH - 6, CW, 6, s.color);
}

function render(): void {
  rect(0, 0, W, H, PAPER);
  // Masthead.
  rect(0, 0, W, 132, NAVY);
  drawText("THE WORLD IN ONE DAY", 512, 26, 4, WHITE, "center");
  rect(412, 66, 200, 3, GOLD);
  drawText("MONDAY, 23 NOVEMBER 2026", 512, 82, 2, WHITE, "center");
  drawText("EIGHT STORIES FROM ONE DAY", 512, 110, 1, FAINT, "center");
  // Grid, 4 columns x 2 rows.
  for (let i = 0; i < STORIES.length; i++) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    drawCard(GX + col * (CW + GUT), GY + row * (CH + GUT), STORIES[i], i + 1);
  }
  // Footer.
  rect(0, 916, W, 108, NAVY);
  drawText(
    "DEAR JUDGE: MONDAY 23 NOVEMBER 2026 IN EIGHT STORIES.",
    512,
    938,
    2,
    WHITE,
    "center",
  );
  drawText("SOURCES: REUTERS - AP - BBC - OCD - HUB247 NEWS", 512, 976, 1, FAINT, "center");
}

function main(): void {
  render();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  mkdirSync(outDir, { recursive: true });
  const buf = encodePNG();
  const p = join(outDir, "entry.png");
  writeFileSync(p, buf);
  console.log(`wrote ${p} ${buf.length} bytes`);
}

main();
