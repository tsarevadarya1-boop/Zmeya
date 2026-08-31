/*
 * «Путь Змеи» — движок: зума + три в ряд.
 * Вся графика рисуется процедурно на canvas (без внешних ассетов).
 * Координатная сетка «дизайн-пространства»: 1000 × 1300, вписывается в экран.
 */
import { sfx } from "./audio";

export type GameState =
  | "menu"
  | "playing"
  | "paused"
  | "dying"
  | "levelclear"
  | "gameover";

export interface HudData {
  state: GameState;
  score: number;
  best: number;
  lives: number;
  level: number;
  remaining: number;
  total: number;
  combo: number;
  muted: boolean;
  current: number;
  next: number;
  bonus: number;
}

export const MARBLE_COLORS = [
  "#ff3b5c", // алый
  "#ffb02e", // янтарь
  "#3ddc74", // нефрит
  "#2fa8ff", // лазурь
  "#d95cff", // орхидея
  "#f4efe4", // жемчуг
];

const D_W = 1000;
const D_H = 1300;
const R = 21; // радиус шара
const GAP = R * 2;
const CONTACT = GAP + 0.9;
const SHOOTER = { x: 500, y: 950 };
const FIRE_SPEED = 1500;
const CLOSE_SPEED = 350;
const SUCK_SPEED = 1100;
const BEST_KEY = "put-zmei-best";

interface Marble {
  d: number;
  color: number;
  flash: number;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  ring: boolean;
}
interface FloatText {
  x: number;
  y: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}
interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
  gold: boolean;
}
interface Banner {
  text: string;
  sub: string;
  t: number;
  dur: number;
}

function levelCfg(n: number) {
  const totals = [34, 42, 48, 56, 62, 70];
  const speeds = [26, 30, 34, 39, 44, 50];
  const colors = [4, 4, 5, 5, 6, 6];
  const i = Math.min(n - 1, totals.length - 1);
  const extra = Math.max(0, n - totals.length);
  return {
    total: totals[i] + extra * 8,
    speed: speeds[i] + extra * 6,
    colors: colors[i],
  };
}

/* ── цветовые утилиты ─────────────────────────── */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function lighten(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(
    g + (255 - g) * f
  )},${Math.round(b + (255 - b) * f)})`;
}
function darken(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgb(${Math.round(r * (1 - f))},${Math.round(g * (1 - f))},${Math.round(
    b * (1 - f)
  )})`;
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ── спрайт шара ──────────────────────────────── */
function makeSprite(hex: string): HTMLCanvasElement {
  const S = 96;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d")!;
  const cx = S / 2;
  const grad = g.createRadialGradient(cx - 16, cx - 18, 5, cx, cx, 46);
  grad.addColorStop(0, lighten(hex, 0.7));
  grad.addColorStop(0.45, hex);
  grad.addColorStop(1, darken(hex, 0.58));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, 44, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.42)";
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath();
  g.ellipse(cx - 15, cx - 17, 10.5, 7, -0.7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.4)";
  g.beginPath();
  g.arc(cx + 14, cx + 17, 4.2, 0, Math.PI * 2);
  g.fill();
  return c;
}

/* ── путь (Catmull-Rom → таблица длин) ────────── */
const CTRL: [number, number][] = [
  [-90, 200],
  [220, 110],
  [520, 78],
  [812, 140],
  [952, 330],
  [898, 545],
  [700, 622],
  [500, 558],
  [330, 478],
  [198, 380],
  [116, 520],
  [178, 702],
  [400, 792],
  [642, 800],
  [842, 882],
  [902, 1052],
  [760, 1192],
  [540, 1236],
  [300, 1182],
];

function buildPath(ctrl: [number, number][]) {
  const pts: { x: number; y: number }[] = [];
  const n = ctrl.length;
  const P = (i: number) => ctrl[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const steps = 26;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      pts.push({
        x:
          0.5 *
          (2 * p1[0] +
            (p2[0] - p0[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        y:
          0.5 *
          (2 * p1[1] +
            (p2[1] - p0[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      });
    }
  }
  pts.push({ x: ctrl[n - 1][0], y: ctrl[n - 1][1] });
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(
      cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    );
  }
  return { pts, cum, len: cum[cum.length - 1] };
}

/* ═══════════════════════════════════════════════ */
export class ZumaEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: (h: HudData) => void;

  private raf = 0;
  private lastT = 0;
  private time = 0;

  private cw = 0;
  private ch = 0;
  private dpr = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;

  private bgLayer: HTMLCanvasElement | null = null;
  private pathLayer: HTMLCanvasElement | null = null;
  private sprites: HTMLCanvasElement[] = MARBLE_COLORS.map(makeSprite);

  private path = buildPath(CTRL);
  private pathLen = this.path.len;

  state: GameState = "menu";
  private marbles: Marble[] = [];
  private shots: Shot[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private motes: Mote[] = [];

  private level = 1;
  private total = 0;
  private spawned = 0;
  private speed = 30;
  private colorCount = 4;
  private score = 0;
  private best = 0;
  private lives = 3;
  private combo = 0;
  private bonus = 0;
  private current = 0;
  private next = 1;

  private aim = -Math.PI / 2;
  private recoil = 0;
  private wobble = 0;
  private shake = 0;
  private flash = 0;
  private danger = 0;
  private lastFire = 0;
  private clearTimer = 0;
  private dieTimer = 0;
  private banner: Banner | null = null;

  private hudKey = "";

  constructor(canvas: HTMLCanvasElement, cb: (h: HudData) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.cb = cb;
    try {
      this.best = parseInt(localStorage.getItem(BEST_KEY) ?? "0", 10) || 0;
    } catch {
      this.best = 0;
    }

    for (let i = 0; i < 44; i++) {
      this.motes.push({
        x: Math.random() * 2000,
        y: Math.random() * 2000,
        r: 1 + Math.random() * 2.4,
        vx: (Math.random() - 0.5) * 9,
        vy: -(5 + Math.random() * 15),
        phase: Math.random() * Math.PI * 2,
        gold: Math.random() < 0.45,
      });
    }

    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.pushHud();

    this.lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.035, (t - this.lastT) / 1000);
      this.lastT = t;
      this.time += dt;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("resize", this.onResize);
  }

  /* ── публичное API ─────────────────────────── */
  startGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.startLevel(1);
  }

  restart() {
    this.startGame();
  }

  togglePause() {
    if (this.state === "playing") this.state = "paused";
    else if (this.state === "paused") this.state = "playing";
    this.pushHud();
  }

  toMenu() {
    this.state = "menu";
    this.marbles = [];
    this.shots = [];
    this.banner = null;
    this.pushHud();
  }

  toggleMute() {
    sfx.setMuted(!sfx.muted);
    this.pushHud();
  }

  swap() {
    if (this.state !== "playing") return;
    [this.current, this.next] = [this.next, this.current];
    this.wobble = 1;
    sfx.swap();
    this.pushHud();
  }

  fire() {
    if (this.state !== "playing") return;
    const now = performance.now();
    if (now - this.lastFire < 140) return;
    this.lastFire = now;
    const dx = Math.cos(this.aim);
    const dy = Math.sin(this.aim);
    this.shots.push({
      x: SHOOTER.x + dx * 40,
      y: SHOOTER.y + dy * 40,
      vx: dx * FIRE_SPEED,
      vy: dy * FIRE_SPEED,
      color: this.current,
    });
    this.recoil = 1;
    for (let i = 0; i < 5; i++) {
      const a = this.aim + (Math.random() - 0.5) * 0.7;
      const sp = 120 + Math.random() * 220;
      this.particles.push({
        x: SHOOTER.x + dx * 44,
        y: SHOOTER.y + dy * 44,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.22,
        max: 0.22,
        size: 3 + Math.random() * 3,
        color: "#ffd873",
        ring: false,
      });
    }
    this.current = this.next;
    this.next = this.randColor();
    sfx.shot();
    this.pushHud();
  }

  /* ── ввод ──────────────────────────────────── */
  private onPointerMove = (e: PointerEvent) => {
    this.updateAim(e);
  };

  private onPointerDown = (e: PointerEvent) => {
    sfx.ensure();
    this.updateAim(e);
    this.fire();
  };

  private updateAim(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - this.ox) / this.scale;
    const y = (e.clientY - rect.top - this.oy) / this.scale;
    const dx = x - SHOOTER.x;
    const dy = y - SHOOTER.y;
    if (dx * dx + dy * dy > 16) this.aim = Math.atan2(dy, dx);
  }

  private onResize = () => {
    this.cw = window.innerWidth;
    this.ch = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
    this.scale = Math.min(this.cw / D_W, this.ch / D_H);
    this.ox = (this.cw - D_W * this.scale) / 2;
    this.oy = (this.ch - D_H * this.scale) / 2;
    this.renderBgLayer();
    this.renderPathLayer();
  };

  /* ── пререндер фона и желоба ───────────────── */
  private renderBgLayer() {
    const c = document.createElement("canvas");
    c.width = Math.round(this.cw * this.dpr);
    c.height = Math.round(this.ch * this.dpr);
    const g = c.getContext("2d")!;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const bg = g.createLinearGradient(0, 0, 0, this.ch);
    bg.addColorStop(0, "#051b20");
    bg.addColorStop(0.5, "#07252a");
    bg.addColorStop(1, "#030f12");
    g.fillStyle = bg;
    g.fillRect(0, 0, this.cw, this.ch);

    const glow1 = g.createRadialGradient(
      this.cw * 0.5,
      this.ch * 0.24,
      10,
      this.cw * 0.5,
      this.ch * 0.24,
      Math.max(this.cw, this.ch) * 0.7
    );
    glow1.addColorStop(0, "rgba(245,184,61,0.07)");
    glow1.addColorStop(1, "rgba(245,184,61,0)");
    g.fillStyle = glow1;
    g.fillRect(0, 0, this.cw, this.ch);

    const glow2 = g.createRadialGradient(
      this.cw * 0.5,
      this.ch * 0.85,
      10,
      this.cw * 0.5,
      this.ch * 0.85,
      Math.max(this.cw, this.ch) * 0.6
    );
    glow2.addColorStop(0, "rgba(46,230,168,0.07)");
    glow2.addColorStop(1, "rgba(46,230,168,0)");
    g.fillStyle = glow2;
    g.fillRect(0, 0, this.cw, this.ch);

    // храмовые кольца вокруг арены
    g.save();
    g.translate(this.ox + (D_W / 2) * this.scale, this.oy + 620 * this.scale);
    g.strokeStyle = "rgba(46,230,168,0.05)";
    for (let i = 1; i <= 6; i++) {
      g.lineWidth = i % 2 === 0 ? 2 : 1;
      g.beginPath();
      g.arc(0, 0, i * 120 * this.scale, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();

    // диагональная резьба
    g.strokeStyle = "rgba(255,255,255,0.018)";
    g.lineWidth = 1;
    for (let x = -this.ch; x < this.cw; x += 34) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + this.ch, this.ch);
      g.stroke();
    }

    // виньетка
    const v = g.createRadialGradient(
      this.cw / 2,
      this.ch / 2,
      Math.min(this.cw, this.ch) * 0.35,
      this.cw / 2,
      this.ch / 2,
      Math.max(this.cw, this.ch) * 0.75
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, this.cw, this.ch);

    this.bgLayer = c;
  }

  private renderPathLayer() {
    const c = document.createElement("canvas");
    c.width = Math.round(this.cw * this.dpr);
    c.height = Math.round(this.ch * this.dpr);
    const g = c.getContext("2d")!;
    g.setTransform(
      this.dpr * this.scale,
      0,
      0,
      this.dpr * this.scale,
      this.dpr * this.ox,
      this.dpr * this.oy
    );

    const p2d = new Path2D();
    const pts = this.path.pts;
    p2d.moveTo(pts[0].x, pts[0].y);
    for (let i = 2; i < pts.length; i += 2) p2d.lineTo(pts[i].x, pts[i].y);
    p2d.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

    g.lineCap = "round";
    g.lineJoin = "round";

    g.strokeStyle = "rgba(2,10,12,0.92)";
    g.lineWidth = 58;
    g.stroke(p2d);

    g.strokeStyle = "rgba(245,184,61,0.22)";
    g.lineWidth = 52;
    g.stroke(p2d);

    g.strokeStyle = "#0c2b30";
    g.lineWidth = 46;
    g.stroke(p2d);

    g.strokeStyle = "#103840";
    g.lineWidth = 38;
    g.stroke(p2d);

    g.setLineDash([3, 27]);
    g.strokeStyle = "rgba(46,230,168,0.28)";
    g.lineWidth = 3;
    g.stroke(p2d);
    g.setLineDash([]);

    // опасная зона у пасти
    const dangerPath = new Path2D();
    let started = false;
    for (let d = this.pathLen - 360; d <= this.pathLen; d += 8) {
      const p = this.pointAt(d);
      if (!started) {
        dangerPath.moveTo(p.x, p.y);
        started = true;
      } else dangerPath.lineTo(p.x, p.y);
    }
    g.strokeStyle = "rgba(255,59,92,0.13)";
    g.lineWidth = 46;
    g.stroke(dangerPath);

    this.pathLayer = c;
  }

  /* ── геометрия пути ────────────────────────── */
  private pointAt(d: number) {
    const { pts, cum, len } = this.path;
    const dd = Math.max(0, Math.min(len, d));
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < dd) lo = mid + 1;
      else hi = mid;
    }
    const i = Math.max(1, lo);
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (dd - cum[i - 1]) / seg;
    const a = pts[i - 1];
    const b = pts[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private randColor(): number {
    // 75% — цвет уже есть в цепи (честные шары), 25% — любой из палитры уровня
    if (this.marbles.length && Math.random() < 0.75) {
      const m = this.marbles[(Math.random() * this.marbles.length) | 0];
      return m.color;
    }
    return (Math.random() * this.colorCount) | 0;
  }

  /* ── уровни и состояния ────────────────────── */
  private startLevel(lv: number) {
    const cfg = levelCfg(lv);
    this.level = lv;
    this.total = cfg.total;
    this.speed = cfg.speed;
    this.colorCount = cfg.colors;
    this.spawned = 0;
    this.marbles = [];
    this.shots = [];
    this.combo = 0;
    this.danger = 0;
    this.current = this.randColor();
    this.next = this.randColor();
    this.banner = {
      text: `УРОВЕНЬ ${lv}`,
      sub: `шаров в цепи: ${cfg.total}`,
      t: 0,
      dur: 1.5,
    };
    this.state = "playing";
    this.pushHud();
  }

  private startDying() {
    if (this.state !== "playing") return;
    this.state = "dying";
    this.lives--;
    this.dieTimer = 0.45;
    this.shake = 16;
    this.flash = 0.5;
    sfx.die();
    this.pushHud();
  }

  private levelClear() {
    this.state = "levelclear";
    this.bonus = 400 + this.level * 100 + this.lives * 150;
    this.score += this.bonus;
    this.clearTimer = 2.1;
    this.flash = 0.35;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 420;
      this.particles.push({
        x: SHOOTER.x,
        y: SHOOTER.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.5,
        max: 1.2,
        size: 3 + Math.random() * 5,
        color: Math.random() < 0.5 ? "#f5b83d" : "#2ee6a8",
        ring: false,
      });
    }
    sfx.win();
    this.pushHud();
  }

  /* ── основная логика ───────────────────────── */
  private update(dt: number) {
    // всегда живые элементы
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y < -10) m.y = this.ch + 10;
      if (m.x < -10) m.x = this.cw + 10;
      if (m.x > this.cw + 10) m.x = -10;
    }
    this.updateParticles(dt);
    this.shake *= Math.exp(-7 * dt);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.wobble = Math.max(0, this.wobble - dt * 5);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }

    if (this.state === "playing") {
      this.spawnStep();
      this.updateChain(dt);
      this.updateShots(dt);
      this.danger =
        this.marbles.length > 0
          ? Math.max(
              0,
              Math.min(
                1,
                (this.marbles[0].d - (this.pathLen - 340)) / 340
              )
            )
          : 0;
      if (this.spawned >= this.total && this.marbles.length === 0) {
        this.levelClear();
      }
    } else if (this.state === "dying") {
      const ms = this.marbles;
      for (let i = ms.length - 1; i >= 0; i--) {
        ms[i].d += SUCK_SPEED * dt;
        if (ms[i].d > this.pathLen + R) {
          const p = this.pointAt(this.pathLen);
          this.burst(p.x, p.y, "#ff3b5c", 5, 160);
          ms.splice(i, 1);
        }
      }
      this.dieTimer -= dt;
      if (ms.length === 0 && this.dieTimer <= 0) {
        if (this.lives > 0) {
          this.startLevel(this.level);
        } else {
          this.state = "gameover";
          if (this.score > this.best) {
            this.best = this.score;
            try {
              localStorage.setItem(BEST_KEY, String(this.best));
            } catch {
              /* приватный режим */
            }
          }
          sfx.over();
          this.pushHud();
        }
      }
    } else if (this.state === "levelclear") {
      this.clearTimer -= dt;
      if (this.clearTimer <= 0) this.startLevel(this.level + 1);
    }
  }

  private spawnStep() {
    const ms = this.marbles;
    if (this.spawned < this.total) {
      const tail = ms[ms.length - 1];
      if (!tail || tail.d - GAP >= -2) {
        ms.push({
          d: tail ? Math.max(0, tail.d - GAP) : 0,
          color: this.randColor(),
          flash: 0,
        });
        this.spawned++;
        this.pushHud();
      }
    }
  }

  private updateChain(dt: number) {
    const ms = this.marbles;
    const n = ms.length;
    if (!n) return;

    const before: boolean[] = [true];
    for (let i = 1; i < n; i++) {
      before.push(ms[i - 1].d - ms[i].d <= CONTACT);
    }

    // движение сегментов: голова ползёт к пасти, хвостовые сегменты доезжают разрывы
    let i = 0;
    while (i < n) {
      let e = i;
      while (e + 1 < n && before[e + 1]) e++;
      if (i === 0) {
        const dd = this.speed * dt;
        for (let k = i; k <= e; k++) ms[k].d += dd;
      } else {
        const maxD = ms[i - 1].d - GAP;
        if (ms[i].d < maxD - 0.01) {
          const dd = Math.min(CLOSE_SPEED * dt, maxD - ms[i].d);
          for (let k = i; k <= e; k++) ms[k].d += dd;
        }
      }
      i = e + 1;
    }

    // новая стыковка сегментов → цепное комбо
    for (let j = 1; j < ms.length; j++) {
      if (!before[j] && ms[j - 1].d - ms[j].d <= CONTACT) {
        this.tryPopAt(j, true);
        break;
      }
    }

    for (const m of this.marbles) {
      if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 4);
    }

    if (this.marbles.length && this.marbles[0].d >= this.pathLen - 4) {
      this.startDying();
    }
  }

  private updateShots(dt: number) {
    const ms = this.marbles;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (
        s.x < -90 ||
        s.x > D_W + 90 ||
        s.y < -90 ||
        s.y > D_H + 90
      ) {
        this.shots.splice(i, 1);
        continue;
      }
      let hit = -1;
      const rr = GAP * 0.95;
      const rr2 = rr * rr;
      for (let k = 0; k < ms.length; k++) {
        const p = this.pointAt(ms[k].d);
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        if (dx * dx + dy * dy < rr2) {
          hit = k;
          break;
        }
      }
      if (hit >= 0) {
        this.insertShot(s, hit);
        this.shots.splice(i, 1);
      }
    }
  }

  /* ── вставка шара в цепь ───────────────────── */
  private insertShot(s: Shot, hitIdx: number) {
    const ms = this.marbles;
    const m = ms[hitIdx];
    const pA = this.pointAt(Math.min(this.pathLen, m.d + GAP));
    const pB = this.pointAt(Math.max(0, m.d - GAP));
    const dA = (pA.x - s.x) ** 2 + (pA.y - s.y) ** 2;
    const dB = (pB.x - s.x) ** 2 + (pB.y - s.y) ** 2;

    let idx: number;
    if (dA <= dB) {
      // перед hitIdx (ближе к пасти): сдвигаем передний сегмент
      if (hitIdx > 0) {
        let k = hitIdx - 1;
        while (k - 1 >= 0 && ms[k - 1].d - ms[k].d <= CONTACT) k--;
        for (let j = k; j < hitIdx; j++) ms[j].d += GAP;
      }
      idx = hitIdx;
      ms.splice(idx, 0, { d: m.d + GAP, color: s.color, flash: 1 });
    } else {
      // после hitIdx (ближе к хвосту): сдвигаем задний сегмент
      const d = Math.max(0, m.d - GAP);
      if (hitIdx + 1 < ms.length) {
        let k = hitIdx + 1;
        while (k + 1 < ms.length && ms[k].d - ms[k + 1].d <= CONTACT) k++;
        for (let j = hitIdx + 1; j <= k; j++) ms[j].d -= GAP;
      }
      idx = hitIdx + 1;
      ms.splice(idx, 0, { d, color: s.color, flash: 1 });
    }

    this.burst(s.x, s.y, MARBLE_COLORS[s.color], 4, 130);
    this.shake = Math.max(this.shake, 2.5);
    this.combo = 0;
    if (!this.tryPopAt(idx, false)) {
      sfx.insert();
    }
    this.pushHud();
  }

  private tryPopAt(idx: number, isChain: boolean): boolean {
    const ms = this.marbles;
    if (idx < 0 || idx >= ms.length) return false;
    const c = ms[idx].color;
    let l = idx;
    while (l - 1 >= 0 && ms[l - 1].d - ms[l].d <= CONTACT && ms[l - 1].color === c)
      l--;
    let r = idx;
    while (
      r + 1 < ms.length &&
      ms[r].d - ms[r + 1].d <= CONTACT &&
      ms[r + 1].color === c
    )
      r++;
    const count = r - l + 1;
    if (count < 3) return false;

    this.combo = isChain ? this.combo + 1 : 1;
    const pts = 10 * count * this.combo;
    this.score += pts;

    const p1 = this.pointAt(ms[l].d);
    const p2 = this.pointAt(ms[r].d);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;

    for (let k = l; k <= r; k++) {
      const p = this.pointAt(ms[k].d);
      this.burst(p.x, p.y, MARBLE_COLORS[c], 9, 330);
    }
    this.particles.push({
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      life: 0.4,
      max: 0.4,
      size: R * 1.4,
      color: MARBLE_COLORS[c],
      ring: true,
    });
    this.texts.push({
      x: cx,
      y: cy - 26,
      life: 1.1,
      max: 1.1,
      text: this.combo > 1 ? `+${pts} ×${this.combo}` : `+${pts}`,
      color: this.combo > 1 ? "#ffd873" : "#eafff5",
      size: this.combo > 1 ? 34 + Math.min(this.combo, 6) * 4 : 30,
    });
    if (this.combo > 1) {
      this.texts.push({
        x: cx,
        y: cy - 66,
        life: 1.1,
        max: 1.1,
        text: "КОМБО!",
        color: "#2ee6a8",
        size: 26,
      });
    }

    ms.splice(l, count);
    this.shake = Math.max(this.shake, 4 + this.combo * 2);
    sfx.pop(this.combo);
    this.pushHud();
    return true;
  }

  private burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.85);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.4,
        max: 0.85,
        size: 2.5 + Math.random() * 4.5,
        color: Math.random() < 0.25 ? "#ffffff" : color,
        ring: false,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (!p.ring) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.exp(-3.2 * dt);
        p.vy *= Math.exp(-3.2 * dt);
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 44 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  /* ── HUD ───────────────────────────────────── */
  private pushHud() {
    const remaining = this.total - this.spawned + this.marbles.length;
    const h: HudData = {
      state: this.state,
      score: this.score,
      best: this.best,
      lives: this.lives,
      level: this.level,
      remaining,
      total: this.total,
      combo: this.combo,
      muted: sfx.muted,
      current: this.current,
      next: this.next,
      bonus: this.bonus,
    };
    const key = `${h.state}|${h.score}|${h.best}|${h.lives}|${h.level}|${h.remaining}|${h.combo}|${h.muted}|${h.current}|${h.next}|${h.bonus}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.cb(h);
    }
  }

  /* ═══ отрисовка ═══════════════════════════════ */
  private draw() {
    const g = this.ctx;
    const t = this.time;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.bgLayer) g.drawImage(this.bgLayer, 0, 0, this.cw, this.ch);

    // парящие пылинки (экранные координаты)
    for (const m of this.motes) {
      const a = 0.16 + 0.14 * Math.sin(t * 1.7 + m.phase);
      g.fillStyle = m.gold
        ? `rgba(245,184,61,${a.toFixed(3)})`
        : `rgba(46,230,168,${(a * 0.8).toFixed(3)})`;
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
    }

    // желоб (с тряской)
    g.setTransform(this.dpr, 0, 0, this.dpr, this.dpr * sx, this.dpr * sy);
    if (this.pathLayer) g.drawImage(this.pathLayer, 0, 0, this.cw, this.ch);

    // дизайн-пространство
    g.setTransform(
      this.dpr * this.scale,
      0,
      0,
      this.dpr * this.scale,
      this.dpr * (this.ox + sx),
      this.dpr * (this.oy + sy)
    );

    this.drawPortal(t);
    this.drawSnakeHead(t);
    this.drawChain();
    this.drawParticles();
    this.drawShots();
    this.drawShooter(t);
    this.drawTexts();
    this.drawBanner();

    // экранные эффекты
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.danger > 0 && this.state === "playing") {
      const pulse = 0.5 + 0.5 * Math.sin(t * 10);
      const a = this.danger * 0.3 * pulse;
      const v = g.createRadialGradient(
        this.cw / 2,
        this.ch / 2,
        Math.min(this.cw, this.ch) * 0.3,
        this.cw / 2,
        this.ch / 2,
        Math.max(this.cw, this.ch) * 0.72
      );
      v.addColorStop(0, "rgba(255,30,60,0)");
      v.addColorStop(1, `rgba(255,30,60,${a.toFixed(3)})`);
      g.fillStyle = v;
      g.fillRect(0, 0, this.cw, this.ch);
    }
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,240,200,${(this.flash * 0.5).toFixed(3)})`;
      g.fillRect(0, 0, this.cw, this.ch);
    }
  }

  private drawPortal(t: number) {
    const g = this.ctx;
    const p = this.pointAt(0);
    const glow = g.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
    glow.addColorStop(0, "rgba(46,230,168,0.35)");
    glow.addColorStop(1, "rgba(46,230,168,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(p.x, p.y, 70, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.translate(p.x, p.y);
    g.rotate(t * 1.4);
    g.setLineDash([12, 10]);
    g.strokeStyle = "rgba(46,230,168,0.75)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.rotate(-t * 2.2);
    g.strokeStyle = "rgba(46,230,168,0.35)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, 40, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  private drawSnakeHead(t: number) {
    const g = this.ctx;
    const p = this.pointAt(this.pathLen);
    const a = this.pointAt(this.pathLen - 12);
    const ang = Math.atan2(p.y - a.y, p.x - a.x);
    const pulse = 0.5 + 0.5 * Math.sin(t * (this.danger > 0 ? 13 : 3.2));

    const glowR = 105 + pulse * 20;
    const ga = 0.16 + this.danger * 0.34 * pulse;
    const gg = g.createRadialGradient(p.x, p.y, 6, p.x, p.y, glowR);
    gg.addColorStop(0, `rgba(255,59,92,${ga.toFixed(3)})`);
    gg.addColorStop(1, "rgba(255,59,92,0)");
    g.fillStyle = gg;
    g.beginPath();
    g.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    g.fill();

    g.save();
    g.translate(p.x, p.y);
    g.rotate(ang);

    const body = g.createLinearGradient(0, -42, 0, 42);
    body.addColorStop(0, "#2fae72");
    body.addColorStop(0.5, "#0e6b4c");
    body.addColorStop(1, "#073c2c");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(8, 0, 47, 38, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(245,184,61,0.55)";
    g.lineWidth = 2.5;
    g.stroke();

    // пасть (открыта в сторону приходящих шаров)
    const open = 13 + 5 * Math.sin(t * 5);
    g.fillStyle = "#140609";
    g.beginPath();
    g.ellipse(-26, 0, 20, open + 8, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,59,92,0.6)";
    g.lineWidth = 2;
    g.stroke();
    // клыки
    g.fillStyle = "#fff3d6";
    g.beginPath();
    g.moveTo(-38, -open - 4);
    g.lineTo(-28, -open + 6);
    g.lineTo(-20, -open - 5);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-38, open + 4);
    g.lineTo(-28, open - 6);
    g.lineTo(-20, open + 5);
    g.closePath();
    g.fill();

    // язык
    if (Math.sin(t * 6.5) > 0.2) {
      g.strokeStyle = "#ff3b5c";
      g.lineWidth = 4;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-44, 0);
      g.quadraticCurveTo(-58, 3, -66, 0);
      g.moveTo(-66, 0);
      g.lineTo(-74, -6);
      g.moveTo(-66, 0);
      g.lineTo(-74, 6);
      g.stroke();
    }

    // глаза
    for (const side of [-1, 1]) {
      g.fillStyle = "#ffd873";
      g.beginPath();
      g.arc(16, side * 21, 8.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#120604";
      g.beginPath();
      g.ellipse(14, side * 21, 2.6, 6.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  private drawChain() {
    const g = this.ctx;
    for (const m of this.marbles) {
      const p = this.pointAt(m.d);
      const s = R * 2;
      g.drawImage(this.sprites[m.color], p.x - R, p.y - R, s, s);
      if (m.flash > 0) {
        g.fillStyle = `rgba(255,255,255,${(m.flash * 0.55).toFixed(3)})`;
        g.beginPath();
        g.arc(p.x, p.y, R + 1, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private drawShots() {
    const g = this.ctx;
    for (const s of this.shots) {
      const len = 3;
      const nx = s.vx / FIRE_SPEED;
      const ny = s.vy / FIRE_SPEED;
      g.globalAlpha = 0.28;
      g.drawImage(
        this.sprites[s.color],
        s.x - nx * len * R - R * 0.8,
        s.y - ny * len * R - R * 0.8,
        R * 1.6,
        R * 1.6
      );
      g.globalAlpha = 1;
      const s2 = R * 2;
      g.drawImage(this.sprites[s.color], s.x - R, s.y - R, s2, s2);
    }
  }

  private drawParticles() {
    const g = this.ctx;
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const k = Math.max(0, p.life / p.max);
      if (p.ring) {
        const r = p.size + (1 - k) * R * 3.4;
        g.globalAlpha = k * 0.9;
        g.strokeStyle = p.color;
        g.lineWidth = 5 * k + 1;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = k;
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.5 + k * 0.7), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    g.globalAlpha = 1;
  }

  private guideLen(): number {
    const dx = Math.cos(this.aim);
    const dy = Math.sin(this.aim);
    let tMin = 300;
    for (const m of this.marbles) {
      const p = this.pointAt(m.d);
      const ox = p.x - SHOOTER.x;
      const oy = p.y - SHOOTER.y;
      const proj = ox * dx + oy * dy;
      if (proj <= 0 || proj > tMin + GAP) continue;
      const perp2 = ox * ox + oy * oy - proj * proj;
      const rr = GAP * 0.95;
      if (perp2 < rr * rr) {
        const tHit = proj - Math.sqrt(rr * rr - perp2);
        if (tHit > 0 && tHit < tMin) tMin = tHit;
      }
    }
    return tMin;
  }

  private drawShooter(t: number) {
    const g = this.ctx;
    const dx = Math.cos(this.aim);
    const dy = Math.sin(this.aim);

    // прицельная пунктирная линия
    if (this.state === "playing") {
      const L = this.guideLen();
      const n = Math.floor(L / 20);
      for (let i = 2; i <= n; i++) {
        const d = i * 20;
        const a = 0.5 * (1 - d / (L + 40));
        g.fillStyle = `rgba(255,216,115,${a.toFixed(3)})`;
        g.beginPath();
        g.arc(SHOOTER.x + dx * d, SHOOTER.y + dy * d, 3.6, 0, Math.PI * 2);
        g.fill();
      }
      const ex = SHOOTER.x + dx * L;
      const ey = SHOOTER.y + dy * L;
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(ex, ey, R + 3, 0, Math.PI * 2);
      g.stroke();
    }

    // каменное основание
    const base = g.createRadialGradient(
      SHOOTER.x - 14,
      SHOOTER.y - 16,
      6,
      SHOOTER.x,
      SHOOTER.y,
      52
    );
    base.addColorStop(0, "#1d4a4a");
    base.addColorStop(1, "#082226");
    g.fillStyle = base;
    g.beginPath();
    g.arc(SHOOTER.x, SHOOTER.y, 47, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(245,184,61,0.5)";
    g.lineWidth = 2.5;
    g.stroke();

    // вращающиеся руны
    g.save();
    g.translate(SHOOTER.x, SHOOTER.y);
    g.rotate(t * 0.5);
    g.setLineDash([11, 13]);
    g.strokeStyle = "rgba(46,230,168,0.55)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 39, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.restore();

    // ствол
    g.strokeStyle = "#0c2f34";
    g.lineWidth = 15;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(SHOOTER.x + dx * 18, SHOOTER.y + dy * 18);
    g.lineTo(SHOOTER.x + dx * 44 - this.recoil * dx * 8, SHOOTER.y + dy * 44 - this.recoil * dy * 8);
    g.stroke();
    g.strokeStyle = "rgba(245,184,61,0.45)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(SHOOTER.x + dx * 20, SHOOTER.y + dy * 20);
    g.lineTo(SHOOTER.x + dx * 42, SHOOTER.y + dy * 42);
    g.stroke();

    // заряженный шар
    const wob = 1 + Math.sin(this.wobble * Math.PI) * 0.25;
    const r1 = R * 1.02 * wob;
    g.drawImage(
      this.sprites[this.current],
      SHOOTER.x - r1,
      SHOOTER.y - r1,
      r1 * 2,
      r1 * 2
    );

    // следующий шар — сбоку
    const nx = SHOOTER.x + 64;
    const ny = SHOOTER.y + 46;
    g.fillStyle = "rgba(4,20,24,0.8)";
    g.beginPath();
    g.arc(nx, ny, R * 0.78 + 5, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(245,184,61,0.4)";
    g.lineWidth = 2;
    g.stroke();
    const r2 = R * 0.72;
    g.drawImage(this.sprites[this.next], nx - r2, ny - r2, r2 * 2, r2 * 2);
    g.fillStyle = "rgba(232,244,239,0.55)";
    g.font = '10px "Russo One", sans-serif';
    g.textAlign = "center";
    g.fillText("СЛЕД.", nx, ny + R * 0.72 + 16);
  }

  private drawTexts() {
    const g = this.ctx;
    g.textAlign = "center";
    for (const t of this.texts) {
      const k = Math.max(0, t.life / t.max);
      g.globalAlpha = Math.min(1, k * 2);
      g.font = `${t.size}px "Russo One", sans-serif`;
      g.strokeStyle = "rgba(0,0,0,0.55)";
      g.lineWidth = 6;
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
  }

  private drawBanner() {
    if (!this.banner) return;
    const g = this.ctx;
    const b = this.banner;
    const k = b.t / b.dur;
    const alpha = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    const scale = 0.85 + 0.15 * Math.min(1, k / 0.2);
    const cx = D_W / 2;
    const cy = D_H * 0.3;
    g.save();
    g.translate(cx, cy);
    g.scale(scale, scale);
    g.globalAlpha = Math.max(0, alpha);
    g.textAlign = "center";
    g.font = '64px "Russo One", sans-serif';
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 10;
    g.strokeText(b.text, 0, 0);
    g.fillStyle = "#f5b83d";
    g.fillText(b.text, 0, 0);
    if (b.sub) {
      g.font = '500 24px "Rubik", sans-serif';
      g.lineWidth = 6;
      g.strokeText(b.sub, 0, 44);
      g.fillStyle = "#bfeee0";
      g.fillText(b.sub, 0, 44);
    }
    g.restore();
    g.globalAlpha = 1;
  }
}
