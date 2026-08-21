export const CANVAS_W = 800;
export const CANVAS_H = 500;
export const TERRAIN_SEGMENTS = 200;
export const SEGMENT_W = CANVAS_W / TERRAIN_SEGMENTS;

export const GRAVITY = 0.06;
export const MAX_POWER = 12;
export const MIN_POWER = 2;
export const TURN_TIME_LIMIT = 10_000;

export const MAX_HP = 100;

export type WeaponType = "cannon" | "missile" | "laser";

export const WEAPONS: Record<
  WeaponType,
  {
    label: string;
    damage: number;
    blastRadius: number;
    speed: number;
  }
> = {
  cannon: { label: "Cannon", damage: 20, blastRadius: 28, speed: 1 },
  missile: { label: "Missile", damage: 35, blastRadius: 44, speed: 0.85 },
  laser: { label: "Laser", damage: 50, blastRadius: 16, speed: 1.4 },
};

export interface Tank {
  x: number;
  hp: number;
  ammo: Record<WeaponType, number>;
  activeWeapon: WeaponType;
  alive: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  weapon: WeaponType;
  alive: boolean;
}

export interface Explosion {
  x: number;
  y: number;
  radius: number;
  elapsed: number;
}

export type Terrain = number[];

export type TurnPhase =
  | "aim"
  | "flying"
  | "explosion"
  | "scoreboard"
  | "gameover";

export interface GameState {
  terrain: Terrain;
  tanks: Tank[];
  currentPlayer: number;
  phase: TurnPhase;
  projectile: Projectile | null;
  explosion: Explosion | null;
  winner: number | null;
  turnTimer: number;
  message: string;
  particles: Particle[];
  trail: { x: number; y: number }[];
  prevTrail: { x: number; y: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function terrainY(terrain: Terrain, x: number): number {
  const seg = x / SEGMENT_W;
  const i = Math.floor(seg);
  if (i < 0) return terrain[0];
  if (i >= TERRAIN_SEGMENTS - 1) return terrain[TERRAIN_SEGMENTS - 1];
  const t = seg - i;
  return terrain[i] * (1 - t) + terrain[i + 1] * t;
}

function randomRange(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

export function generateTerrain(): Terrain {
  const t: Terrain = new Array(TERRAIN_SEGMENTS);
  const baseY = CANVAS_H * 0.6;
  for (let i = 0; i < TERRAIN_SEGMENTS; i++) {
    const x = i / TERRAIN_SEGMENTS;
    t[i] = baseY
      + Math.sin(x * Math.PI * 2.3 + 0.5) * 55
      + Math.sin(x * Math.PI * 4.7 + 1.8) * 30
      + Math.sin(x * Math.PI * 8.1 + 3.2) * 15
      + Math.sin(x * Math.PI * 1.1 + 0.3) * 70;
  }
  for (let i = 0; i < TERRAIN_SEGMENTS; i++) {
    t[i] = clamp(t[i], CANVAS_H * 0.3, CANVAS_H * 0.88);
  }
  return t;
}

export function placeTanks(_terrain: Terrain): Tank[] {
  const x1 = Math.floor(randomRange(TERRAIN_SEGMENTS * 0.08, TERRAIN_SEGMENTS * 0.2));
  const x2 = Math.floor(randomRange(TERRAIN_SEGMENTS * 0.78, TERRAIN_SEGMENTS * 0.92));
  return [
    {
      x: x1 * SEGMENT_W,
      hp: MAX_HP,
      ammo: { cannon: Infinity, missile: 4, laser: 2 },
      activeWeapon: "cannon",
      alive: true,
    },
    {
      x: x2 * SEGMENT_W,
      hp: MAX_HP,
      ammo: { cannon: Infinity, missile: 4, laser: 2 },
      activeWeapon: "cannon",
      alive: true,
    },
  ];
}

export function fire(
  s: GameState,
  angle: number,
  power: number,
): void {
  const tank = s.tanks[s.currentPlayer];
  if (!tank.alive) return;

  const wpn = WEAPONS[tank.activeWeapon];
  const muzzleX = tank.x;
  const muzzleY = terrainY(s.terrain, tank.x) - 12;
  const rad = (-angle * Math.PI) / 180;

  s.projectile = {
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(rad) * power * wpn.speed,
    vy: Math.sin(rad) * power * wpn.speed,
    weapon: tank.activeWeapon,
    alive: true,
  };

  tank.ammo[tank.activeWeapon]--;
  if (tank.ammo[tank.activeWeapon] <= 0) {
    tank.activeWeapon = "cannon";
  }

  s.phase = "flying";
  s.message = "";
  s.prevTrail = [...s.trail];
  s.trail = [];
}

function spawnExplosion(s: GameState, x: number, y: number, radius: number): void {
  s.explosion = { x, y, radius, elapsed: 0 };
  s.phase = "explosion";
}

function carveTerrain(terrain: Terrain, cx: number, radius: number): void {
  const startSeg = Math.max(0, Math.floor((cx - radius) / SEGMENT_W));
  const endSeg = Math.min(
    TERRAIN_SEGMENTS - 1,
    Math.ceil((cx + radius) / SEGMENT_W),
  );
  for (let i = startSeg; i <= endSeg; i++) {
    const sx = i * SEGMENT_W;
    const dist = Math.abs(sx - cx);
    if (dist < radius) {
      const depth = radius * 0.7 * (1 - dist / radius);
      terrain[i] = Math.min(CANVAS_H, terrain[i] + depth);
    }
  }
}

function spawnParticles(s: GameState, x: number, y: number, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomRange(1, 5);
    s.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: randomRange(20, 50),
      maxLife: 50,
      color,
    });
  }
}

export function tick(s: GameState, dt: number): void {
  s.turnTimer += dt;

  for (let i = s.particles.length - 1; i >= 0; i--) {
    const p = s.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 1;
    if (p.life <= 0) s.particles.splice(i, 1);
  }

  if (s.phase === "flying" && s.projectile?.alive) {
    const p = s.projectile;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += GRAVITY;
    s.trail.push({ x: p.x, y: p.y });

    if (p.x < -50 || p.x > CANVAS_W + 50 || p.y > CANVAS_H + 50) {
      p.alive = false;
      s.phase = "aim";
      s.message = "Out of bounds!";
      s.currentPlayer = 1 - s.currentPlayer;
      s.turnTimer = 0;
      return;
    }

    const groundY = terrainY(s.terrain, p.x);
    if (p.y >= groundY) {
      p.alive = false;
      const wpn = WEAPONS[p.weapon];
      carveTerrain(s.terrain, p.x, wpn.blastRadius);
      spawnExplosion(s, p.x, p.y, wpn.blastRadius);
      spawnParticles(s, p.x, p.y, 15, "#ff8844");
    }
  }

  if (s.phase === "explosion" && s.explosion) {
    s.explosion.elapsed += dt;
    const other = 1 - s.currentPlayer;
    const ot = s.tanks[other];
    if (ot.alive) {
      const wpn = WEAPONS[s.projectile?.weapon ?? "cannon"];
      const dist = Math.hypot(ot.x - s.explosion.x, terrainY(s.terrain, ot.x) - s.explosion.y);
      if (dist < wpn.blastRadius) {
        const factor = 1 - dist / wpn.blastRadius;
        const dmg = Math.round(factor * wpn.damage);
        ot.hp = Math.max(0, ot.hp - dmg);
        if (ot.hp <= 0) {
          ot.alive = false;
          spawnParticles(s, ot.x, terrainY(s.terrain, ot.x) - 8, 25, "#ff3355");
        }
      }
    }

    if (s.explosion.elapsed > 500) {
      s.explosion = null;
      s.projectile = null;

      const aliveCount = s.tanks.filter((t) => t.alive).length;
      if (aliveCount <= 1) {
        s.winner = s.tanks[0].alive ? 0 : 1;
        s.phase = "gameover";
        s.message = s.winner === 0 ? "Player 1 wins!" : "Player 2 wins!";
        return;
      }

      if (s.turnTimer > TURN_TIME_LIMIT) {
        s.message = "Time's up! Turn skipped.";
      }

      s.currentPlayer = 1 - s.currentPlayer;
      s.turnTimer = 0;
      s.phase = "aim";
    }
  }

  if (s.phase === "scoreboard") {
    s.turnTimer += dt;
  }
}

export function initGame(): GameState {
  const terrain = generateTerrain();
  const tanks = placeTanks(terrain);
  return {
    terrain,
    tanks,
    currentPlayer: 0,
    phase: "aim",
    projectile: null,
    explosion: null,
    winner: null,
    turnTimer: 0,
    message: "Player 1's turn — aim and fire!",
    particles: [],
    trail: [],
    prevTrail: [],
  };
}

export function switchWeapon(tank: Tank): void {
  const order: WeaponType[] = ["cannon", "missile", "laser"];
  const idx = order.indexOf(tank.activeWeapon);
  for (let i = 1; i < order.length; i++) {
    const next = order[(idx + i) % order.length];
    if (tank.ammo[next] > 0) {
      tank.activeWeapon = next;
      return;
    }
  }
}

export function aiTurn(s: GameState): void {
  const tank = s.tanks[s.currentPlayer];
  const target = s.tanks[1 - s.currentPlayer];
  if (!tank.alive || !target.alive) return;

  const dx = target.x - tank.x;
  const baseAngle = dx > 0 ? 45 : 135;
  const angle = clamp(baseAngle + randomRange(-20, 20), 15, 165);
  const power = clamp(Math.abs(dx) / 60 + randomRange(-2, 2), MIN_POWER, MAX_POWER);

  fire(s, angle, power);
}