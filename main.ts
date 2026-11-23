// The World in One Day — 23 November 2026
// A program that draws one 1024x1024 PNG summing up the day's world news:
// a dark masthead, a 4x2 grid of story cards (icon, headline, sub, tag),
// and a dark footer. Stdlib only, deterministic, no network.
//
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Writes: $MAKEFUN_OUTPUT_DIR/entry.png

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------------------
// 5x7 bitmap font, written as string art ("#" = ink, "." = blank).
// ---------------------------------------------------------------------------

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
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
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
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", "#.##.", "#..##"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  $: ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
};

// ---------------------------------------------------------------------------
// Canvas: a plain RGB byte buffer with tiny drawing primitives.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

type RGB = [number, number, number];

function hex(rgb: string): RGB {
  const n = parseInt(rgb.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

class Canvas {
  buf: Buffer;
  constructor() {
    this.buf = Buffer.alloc(W * H * 3, 255);
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  // Bresenham line.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // Filled circle.
  disc(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.px(cx + x, cy + y, c);
    }
  }
  // Circle outline, 2px thick.
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 1) {
      const t = (a * Math.PI) / 180;
      const x = Math.round(cx + r * Math.cos(t));
      const y = Math.round(cy + r * Math.sin(t));
      this.px(x, y, c);
      this.px(x + 1, y, c);
      this.px(x, y + 1, c);
    }
  }
  // Arc segment (degrees), drawn as short chords.
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB): void {
    let px = -1;
    let py = -1;
    for (let a = a0; a <= a1; a += 3) {
      const t = (a * Math.PI) / 180;
      const x = Math.round(cx + r * Math.cos(t));
      const y = Math.round(cy + r * Math.sin(t));
      if (px >= 0) this.line(px, py, x, y, c);
      px = x;
      py = y;
    }
  }
  // Filled triangle by scanline.
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
    const minY = Math.min(ay, by, cy);
    const maxY = Math.max(ay, by, cy);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: Array<[number, number, number, number]> = [
        [ax, ay, bx, by],
        [bx, by, cx, cy],
        [cx, cy, ax, ay],
      ];
      for (const [x0, y0, x1, y1] of edges) {
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
          xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        for (let x = lo; x <= hi; x++) this.px(x, y, c);
      }
    }
  }
  // Filled quadrilateral from four corners.
  quad(p: Array<[number, number]>, c: RGB): void {
    this.tri(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], c);
    this.tri(p[0][0], p[0][1], p[2][0], p[2][1], p[3][0], p[3][1], c);
  }
}

// ---------------------------------------------------------------------------
// Text: draw the 5x7 font at a scale; wrap on word boundaries.
// ---------------------------------------------------------------------------

const GLYPH_W = 5;
const GLYPH_H = 7;

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * (GLYPH_W + 1) * scale - scale;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < GLYPH_H; r++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (g[r][col] === "#") {
          cv.rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += (GLYPH_W + 1) * scale;
  }
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap into lines of at most maxChars characters.
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Palette.
// ---------------------------------------------------------------------------

const NAVY = hex("#0B1526");
const NAVY2 = hex("#13233D");
const PAPER = hex("#F7F3EA");
const CARD_LINE = hex("#D8D2C2");
const INK = hex("#17202E");
const MUTED = hex("#5A6472");
const WHITE = hex("#FFFFFF");
const GOLD = hex("#E8B33C");

// ---------------------------------------------------------------------------
// Icons: one small geometric scene per story, drawn in a 120x120 box
// whose top-left is (ox, oy). All coordinates are the author's own.
// ---------------------------------------------------------------------------

type IconFn = (cv: Canvas, ox: number, oy: number, accent: RGB) => void;

const ICONS: Record<string, IconFn> = {
  // COP31 — a globe: ring, equator and meridian chords.
  globe: (cv, ox, oy, a) => {
    const cx = ox + 60;
    const cy = oy + 56;
    cv.ring(cx, cy, 44, a);
    cv.ring(cx, cy, 43, a);
    // Equator and two latitude chords.
    cv.line(cx - 44, cy, cx + 44, cy, a);
    cv.line(cx - 38, cy - 26, cx + 38, cy - 26, a);
    cv.line(cx - 38, cy + 26, cx + 38, cy + 26, a);
    // Meridian: vertical chord plus a slanted one.
    cv.line(cx, cy - 44, cx, cy + 44, a);
    cv.line(cx - 22, cy - 38, cx + 22, cy + 38, a);
    cv.line(cx + 22, cy - 38, cx - 22, cy + 38, a);
    // Small land dot.
    cv.disc(cx - 14, cy - 12, 6, a);
    cv.disc(cx + 18, cy + 16, 5, a);
  },
  // Hormuz — a rocket climbing, flame below.
  rocket: (cv, ox, oy, a) => {
    const cx = ox + 60;
    cv.tri(cx, oy + 4, cx - 16, oy + 34, cx + 16, oy + 34, a);
    cv.rect(cx - 16, oy + 34, 32, 44, a);
    cv.tri(cx - 16, oy + 52, cx - 30, oy + 82, cx - 16, oy + 78, a);
    cv.tri(cx + 16, oy + 52, cx + 30, oy + 82, cx + 16, oy + 78, a);
    cv.rect(cx - 6, oy + 48, 12, 12, PAPER);
    cv.tri(cx - 10, oy + 78, cx + 10, oy + 78, cx, oy + 108, hex("#E8590C"));
    cv.tri(cx - 5, oy + 78, cx + 5, oy + 78, cx, oy + 96, GOLD);
  },
  // Kyiv — a tower block split by a red crack, rubble at its foot.
  tower: (cv, ox, oy, a) => {
    const bx = ox + 34;
    const by = oy + 18;
    cv.rect(bx, by, 52, 76, a);
    cv.rect(bx + 52, by + 26, 34, 68, hex("#8A94A6"));
    // Windows.
    for (const wy of [30, 46, 62]) {
      cv.rect(bx + 8, by + wy - 18, 10, 8, PAPER);
      cv.rect(bx + 32, by + wy - 18, 10, 8, PAPER);
    }
    // Crack, zigzag from roof to ground, kept inside the block.
    const red = hex("#C92A2A");
    let px = bx + 26;
    let py = by;
    const steps: Array<[number, number]> = [[8, 13], [-6, 13], [9, 13], [-7, 13], [6, 13], [-4, 11]];
    for (const [dx, dy] of steps) {
      cv.line(px, py, px + dx, py + dy, red);
      cv.line(px + 1, py, px + dx + 1, py + dy, red);
      px += dx;
      py += dy;
    }
    // Rubble.
    cv.tri(ox + 20, oy + 108, ox + 34, oy + 94, ox + 48, oy + 108, hex("#8A94A6"));
    cv.tri(ox + 66, oy + 108, ox + 82, oy + 96, ox + 98, oy + 108, hex("#8A94A6"));
  },
  // Indonesia — a factory with chimney, flames licking the roof.
  factory: (cv, ox, oy, a) => {
    cv.rect(ox + 18, oy + 62, 84, 46, a);
    cv.rect(ox + 78, oy + 30, 14, 34, a);
    cv.rect(ox + 26, oy + 72, 12, 12, PAPER);
    cv.rect(ox + 48, oy + 72, 12, 12, PAPER);
    cv.rect(ox + 70, oy + 72, 12, 12, PAPER);
    // Flames: two layered triangles above the roofline.
    cv.tri(ox + 22, oy + 64, ox + 44, oy + 20, ox + 52, oy + 64, hex("#E8590C"));
    cv.tri(ox + 56, oy + 64, ox + 74, oy + 28, ox + 92, oy + 64, hex("#E8590C"));
    cv.tri(ox + 32, oy + 64, ox + 44, oy + 38, ox + 54, oy + 64, GOLD);
    cv.tri(ox + 62, oy + 64, ox + 74, oy + 42, ox + 86, oy + 64, GOLD);
  },
  // Lisbon — a megaphone with sound arcs.
  megaphone: (cv, ox, oy, a) => {
    cv.quad(
      [
        [ox + 18, oy + 44],
        [ox + 78, oy + 22],
        [ox + 78, oy + 88],
        [ox + 18, oy + 66],
      ],
      a
    );
    cv.rect(ox + 8, oy + 44, 12, 22, a);
    cv.rect(ox + 34, oy + 66, 10, 26, a);
    // Sound arcs to the right.
    cv.arc(ox + 84, oy + 55, 14, -50, 50, a);
    cv.arc(ox + 84, oy + 55, 26, -50, 50, a);
    cv.arc(ox + 84, oy + 55, 38, -50, 50, a);
  },
  // Cricket — a bat (parallelogram) and a red ball with a seam.
  cricket: (cv, ox, oy, a) => {
    cv.quad(
      [
        [ox + 22, oy + 98],
        [ox + 46, oy + 16],
        [ox + 70, oy + 24],
        [ox + 46, oy + 106],
      ],
      a
    );
    cv.quad(
      [
        [ox + 46, oy + 16],
        [ox + 54, oy + 4],
        [ox + 70, oy + 10],
        [ox + 70, oy + 24],
      ],
      hex("#8A94A6")
    );
    const red = hex("#C92A2A");
    cv.disc(ox + 92, oy + 82, 16, red);
    cv.arc(ox + 92, oy + 82, 9, 20, 160, WHITE);
    cv.arc(ox + 92, oy + 82, 9, 200, 340, WHITE);
  },
  // Nepal-India — two small flags on poles.
  flags: (cv, ox, oy, a) => {
    // Left flag: crimson pennant (Nepal).
    cv.line(ox + 34, oy + 12, ox + 34, oy + 104, a);
    cv.tri(ox + 34, oy + 14, ox + 74, oy + 30, ox + 34, oy + 46, hex("#C92A2A"));
    cv.tri(ox + 34, oy + 46, ox + 66, oy + 58, ox + 34, oy + 70, hex("#C92A2A"));
    // Right flag: three stripes (India) with a wheel dot.
    cv.line(ox + 88, oy + 12, ox + 88, oy + 104, a);
    cv.rect(ox + 88, oy + 14, 30, 10, hex("#E8590C"));
    cv.rect(ox + 88, oy + 24, 30, 10, WHITE);
    cv.rect(ox + 88, oy + 34, 30, 10, hex("#1971C2"));
    cv.disc(ox + 103, oy + 29, 4, hex("#1971C2"));
  },
  // Korea — a graduation cap: diamond board, band, tassel.
  cap: (cv, ox, oy, a) => {
    cv.quad(
      [
        [ox + 60, oy + 18],
        [ox + 108, oy + 44],
        [ox + 60, oy + 70],
        [ox + 12, oy + 44],
      ],
      a
    );
    cv.rect(ox + 40, oy + 56, 40, 26, a);
    cv.tri(ox + 40, oy + 82, ox + 80, oy + 82, ox + 60, oy + 92, a);
    // Tassel hanging from the right corner.
    cv.line(ox + 108, oy + 44, ox + 108, oy + 84, GOLD);
    cv.line(ox + 109, oy + 44, ox + 109, oy + 84, GOLD);
    cv.disc(ox + 108, oy + 90, 5, GOLD);
  },
};

// ---------------------------------------------------------------------------
// The eight stories of Monday 23 November 2026.
// ---------------------------------------------------------------------------

interface Story {
  tag: string;
  icon: string;
  accent: string;
  headline: string;
  sub: string;
}

const STORIES: Story[] = [
  {
    tag: "CLIMATE",
    icon: "globe",
    accent: "#0E7C5B",
    headline: "COP31 TALKS COLLAPSE",
    sub: "Antalya ends with no deal; the final draft drops 'fossil fuels'.",
  },
  {
    tag: "GULF WAR",
    icon: "rocket",
    accent: "#B3261E",
    headline: "MISSILES HIT US BASE IN BAHRAIN",
    sub: "Iran strikes; Houthis fire at Saudi Arabia; tankers at risk.",
  },
  {
    tag: "UKRAINE",
    icon: "tower",
    accent: "#1D4ED8",
    headline: "DRONE HITS KYIV 14 MISSING",
    sub: "Russian strike on a building; Ukraine sets a Russian ship ablaze.",
  },
  {
    tag: "DISASTER",
    icon: "factory",
    accent: "#C2410C",
    headline: "FACTORY FIRE 50 MISSING",
    sub: "Seven bodies found after a blaze at an Indonesian candy plant.",
  },
  {
    tag: "PROTEST",
    icon: "megaphone",
    accent: "#6D28D9",
    headline: "LISBON MARCHES ON LIVING COSTS",
    sub: "Thousands take to the streets as prices fuel anger.",
  },
  {
    tag: "SPORT",
    icon: "cricket",
    accent: "#15803D",
    headline: "INDIA SMASH RECORD 720/9",
    sub: "Record Test total in Wellington against New Zealand.",
  },
  {
    tag: "DIPLOMACY",
    icon: "flags",
    accent: "#B45309",
    headline: "NEPAL PM MEETS MODI IN DELHI",
    sub: "Balendra Shah on a state visit; talks span ties and region.",
  },
  {
    tag: "POLITICS",
    icon: "cap",
    accent: "#334155",
    headline: "MINISTER QUITS OVER AI CHEATING",
    sub: "South Korea education chief resigns in exam scandal.",
  },
];

// ---------------------------------------------------------------------------
// Layout: masthead, 4x2 card grid, footer.
// ---------------------------------------------------------------------------

const MASTHEAD_H = 88;
const FOOTER_H = 88;
const GRID_TOP = MASTHEAD_H;
const GRID_H = H - MASTHEAD_H - FOOTER_H; // 848
const COLS = 4;
const ROWS = 2;
const CARD_W = W / COLS; // 256
const CARD_H = GRID_H / ROWS; // 424

function drawCard(cv: Canvas, s: Story, col: number, row: number): void {
  const x0 = col * CARD_W;
  const y0 = GRID_TOP + row * CARD_H;
  const accent = hex(s.accent);

  // Card body and border.
  cv.rect(x0, y0, CARD_W, CARD_H, PAPER);
  cv.rect(x0, y0, CARD_W, 2, CARD_LINE);
  cv.rect(x0, y0, 2, CARD_H, CARD_LINE);
  cv.rect(x0 + CARD_W - 2, y0, 2, CARD_H, CARD_LINE);
  cv.rect(x0, y0 + CARD_H - 2, CARD_W, 2, CARD_LINE);
  // Accent bar across the top of the card.
  cv.rect(x0, y0, CARD_W, 6, accent);

  // Tag chip, top-left.
  const tagW = textWidth(s.tag, 1) + 16;
  cv.rect(x0 + 14, y0 + 20, tagW, 20, accent);
  drawText(cv, s.tag, x0 + 22, y0 + 27, 1, WHITE);

  // Icon, centred in its zone.
  const icon = ICONS[s.icon];
  icon(cv, x0 + (CARD_W - 120) / 2, y0 + 52, accent);

  // Divider under the icon zone.
  cv.rect(x0 + 14, y0 + 178, CARD_W - 28, 2, CARD_LINE);

  // Headline: two lines, scale 2, left-aligned.
  const headLines = wrap(s.headline, 19).slice(0, 2);
  headLines.forEach((ln, i) => {
    drawText(cv, ln, x0 + 14, y0 + 196 + i * 28, 2, INK);
  });

  // Sub: wrapped, scale 1, muted.
  const subLines = wrap(s.sub, 38).slice(0, 4);
  subLines.forEach((ln, i) => {
    drawText(cv, ln, x0 + 14, y0 + 262 + i * 12, 1, MUTED);
  });

  // Small footer inside the card: story number.
  const num = "0" + (STORIES.indexOf(s) + 1);
  drawText(cv, num + " / 08", x0 + 14, y0 + CARD_H - 30, 1, accent);
  cv.rect(x0 + CARD_W - 14 - 44, y0 + CARD_H - 26, 44, 4, accent);
}

function drawImage(): Canvas {
  const cv = new Canvas();
  // Paper background.
  cv.rect(0, 0, W, H, PAPER);

  // Masthead.
  cv.rect(0, 0, W, MASTHEAD_H, NAVY);
  cv.rect(0, MASTHEAD_H - 4, W, 4, GOLD);
  drawTextCentered(cv, "THE WORLD IN ONE DAY", W / 2, 16, 4, WHITE);
  drawTextCentered(cv, "MONDAY 23 NOVEMBER 2026", W / 2, 58, 2, GOLD);

  // Cards.
  STORIES.forEach((s, i) => {
    drawCard(cv, s, i % COLS, Math.floor(i / COLS));
  });

  // Footer.
  const fy = H - FOOTER_H;
  cv.rect(0, fy, W, FOOTER_H, NAVY);
  cv.rect(0, fy, W, 4, GOLD);
  drawTextCentered(
    cv,
    "DEAR JUDGE: MONDAY 23 NOVEMBER 2026 IN EIGHT STORIES.",
    W / 2,
    fy + 16,
    2,
    WHITE
  );
  drawTextCentered(
    cv,
    "SOURCES: REUTERS - AP - ARAB NEWS - JAGRAN JOSH - OBSERVER VOICE",
    W / 2,
    fy + 56,
    1,
    hex("#9AA7BB")
  );
  return cv;
}

// ---------------------------------------------------------------------------
// PNG encoder, hand-rolled: CRC32 + chunk framing + zlib (stdlib) for IDAT.
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePng(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Scanlines with filter byte 0 (none).
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    cv.buf.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePng(drawImage());
  const outPath = path.join(outDir, "entry.png");
  fs.writeFileSync(outPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${outPath} (${png.length} bytes, sha256 ${sha})`);
}

main();
