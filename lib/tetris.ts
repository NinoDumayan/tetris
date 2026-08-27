export const COLS = 10;
export const ROWS = 20;

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";

export const TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export const COLORS: Record<Cell, string> = {
  0: "#05070f",
  I: "#22d3ee",
  O: "#fde047",
  T: "#c084fc",
  S: "#4ade80",
  Z: "#f87171",
  J: "#60a5fa",
  L: "#fb923c",
  G: "#64748b",
};

export const SHAPES: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export type Cell = 0 | PieceType | "G";

export type Board = Cell[][];

export function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function drawFromBag(bag: PieceType[]): PieceType {
  if (bag.length === 0) {
    bag.push(...shuffle(TYPES));
  }
  return bag.shift()!;
}

export interface ActivePiece {
  type: PieceType;
  shape: number[][];
  x: number;
  y: number;
}

export function spawnPiece(type: PieceType): ActivePiece {
  const shape = SHAPES[type].map((row) => [...row]);
  const x = Math.floor((COLS - shape[0].length) / 2);
  const y = type === "I" ? -1 : 0;
  return { type, shape, x, y };
}

export function collides(
  board: Board,
  shape: number[][],
  x: number,
  y: number,
): boolean {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const bx = x + c;
      const by = y + r;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx] !== 0) return true;
    }
  }
  return false;
}

export function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out[c][n - 1 - r] = m[r][c];
    }
  }
  return out;
}

export function rotateCCW(m: number[][]): number[][] {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out[n - 1 - c][r] = m[r][c];
    }
  }
  return out;
}

const KICKS = [0, -1, 1, -2, 2];

export function tryRotate(
  board: Board,
  piece: ActivePiece,
  dir: 1 | -1,
): boolean {
  const rotated = dir === 1 ? rotateCW(piece.shape) : rotateCCW(piece.shape);
  for (const k of KICKS) {
    if (!collides(board, rotated, piece.x + k, piece.y)) {
      piece.shape = rotated;
      piece.x += k;
      return true;
    }
  }
  return false;
}

export function ghostY(
  board: Board,
  shape: number[][],
  x: number,
  y: number,
): number {
  let gy = y;
  while (!collides(board, shape, x, gy + 1)) gy++;
  return gy;
}

export function lockPiece(board: Board, piece: ActivePiece): boolean {
  let over = false;
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const by = piece.y + r;
      const bx = piece.x + c;
      if (by < 0 || by >= ROWS) {
        if (by < 0) over = true;
        continue;
      }
      board[by][bx] = piece.type;
    }
  }
  return over;
}

export function clearLines(board: Board): number {
  const remaining = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = ROWS - remaining.length;
  while (remaining.length < ROWS) {
    remaining.unshift(Array<Cell>(COLS).fill(0));
  }
  for (let r = 0; r < ROWS; r++) {
    board[r] = remaining[r];
  }
  return cleared;
}

function findFullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (board[r].every((cell) => cell !== 0)) rows.push(r);
  }
  return rows;
}

export const LINE_SCORES = [0, 100, 300, 500, 800];

export function levelSpeed(level: number): number {
  return Math.max(60, Math.round(900 * Math.pow(0.82, level - 1)));
}

export function levelFromLines(lines: number): number {
  return Math.floor(lines / 10) + 1;
}

export type Status = "playing" | "paused" | "over";

export const PREVIEW_COUNT = 3;

export const CLEAR_ANIMATION_MS = 200;

export interface Clearing {
  rows: number[];
  remaining: number;
}

export interface GameState {
  board: Board;
  current: ActivePiece;
  queue: PieceType[];
  bag: PieceType[];
  hold: PieceType | null;
  canHold: boolean;
  score: number;
  lines: number;
  level: number;
  status: Status;
  lastLockUneven: boolean;
  clearing: Clearing | null;
  lastLockedType: PieceType | null;
}

function topUpQueue(queue: PieceType[], bag: PieceType[]) {
  while (queue.length < PREVIEW_COUNT) {
    queue.push(drawFromBag(bag));
  }
}

export function initGame(): GameState {
  const bag: PieceType[] = [];
  const queue: PieceType[] = [];
  for (let i = 0; i < PREVIEW_COUNT + 1; i++) {
    queue.push(drawFromBag(bag));
  }
  return {
    board: createBoard(),
    current: spawnPiece(queue.shift()!),
    queue,
    bag,
    hold: null,
    canHold: true,
    score: 0,
    lines: 0,
    level: 1,
    status: "playing",
    lastLockUneven: false,
    clearing: null,
    lastLockedType: null,
  };
}

export function moveLeft(s: GameState): void {
  if (s.clearing) return;
  if (!collides(s.board, s.current.shape, s.current.x - 1, s.current.y)) {
    s.current.x--;
  }
}

export function moveRight(s: GameState): void {
  if (s.clearing) return;
  if (!collides(s.board, s.current.shape, s.current.x + 1, s.current.y)) {
    s.current.x++;
  }
}

export function softDrop(s: GameState): void {
  if (s.clearing) return;
  if (!collides(s.board, s.current.shape, s.current.x, s.current.y + 1)) {
    s.current.y++;
    s.score++;
  }
}

function hasGapBeneath(board: Board, piece: ActivePiece): boolean {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const by = piece.y + r;
      const bx = piece.x + c;
      if (by < 0 || by >= ROWS) continue;
      const below = by + 1;
      if (below < ROWS && board[below][bx] === 0) return true;
    }
  }
  return false;
}

function spawnNext(s: GameState): void {
  const nextType = s.queue.shift()!;
  s.current = spawnPiece(nextType);
  topUpQueue(s.queue, s.bag);
  s.canHold = true;

  if (collides(s.board, s.current.shape, s.current.x, s.current.y)) {
    s.status = "over";
  }
}

export function finalizeClear(s: GameState): number {
  if (!s.clearing) return 0;
  const cleared = clearLines(s.board);
  s.lines += cleared;
  s.score += LINE_SCORES[cleared] * s.level;
  s.level = levelFromLines(s.lines);
  s.clearing = null;
  spawnNext(s);
  return cleared;
}

export function lock(s: GameState): void {
  const over = lockPiece(s.board, s.current);
  s.lastLockUneven = hasGapBeneath(s.board, s.current);
  s.lastLockedType = s.current.type;
  if (over) {
    s.status = "over";
    return;
  }

  const fullRows = findFullRows(s.board);
  if (fullRows.length > 0) {
    s.clearing = { rows: fullRows, remaining: CLEAR_ANIMATION_MS };
    return;
  }
  spawnNext(s);
}

export function hardDrop(s: GameState): void {
  if (s.clearing) return;
  const gy = ghostY(s.board, s.current.shape, s.current.x, s.current.y);
  const delta = gy - s.current.y;
  s.current.y = gy;
  s.score += delta * 2;
  lock(s);
}

export function gravityTick(s: GameState): void {
  if (s.clearing) return;
  if (!collides(s.board, s.current.shape, s.current.x, s.current.y + 1)) {
    s.current.y++;
  } else {
    lock(s);
  }
}

export function rotate(s: GameState, dir: 1 | -1): void {
  if (s.clearing) return;
  tryRotate(s.board, s.current, dir);
}

export function hold(s: GameState): void {
  if (s.clearing || !s.canHold) return;
  const prev = s.hold;
  s.hold = s.current.type;
  s.current = prev ? spawnPiece(prev) : spawnPiece(s.queue.shift()!);
  topUpQueue(s.queue, s.bag);
  s.canHold = false;
  if (collides(s.board, s.current.shape, s.current.x, s.current.y)) {
    s.status = "over";
  }
}

export function calcGarbage(linesCleared: number): number {
  if (linesCleared <= 1) return 0;
  if (linesCleared === 2) return 1;
  if (linesCleared === 3) return 2;
  return 4;
}

export function receiveGarbage(board: Board, count: number): void {
  for (let i = 0; i < count; i++) {
    board.shift();
    const gap = Math.floor(Math.random() * COLS);
    const row: Cell[] = [];
    for (let c = 0; c < COLS; c++) {
      row.push(c === gap ? 0 : "G");
    }
    board.push(row);
  }
}

export function getBoardState(board: Board): (string | number)[][] {
  return board.map((row) => [...row]);
}

export function setBoardState(board: Board, state: (string | number)[][]): void {
  for (let r = 0; r < ROWS; r++) {
    if (state[r]) {
      board[r] = [...state[r]] as Cell[];
    }
  }
}