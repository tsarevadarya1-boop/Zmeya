import { useCallback, useEffect, useRef, useState } from "react";
import { ZumaEngine, MARBLE_COLORS } from "./game/engine";
import type { HudData } from "./game/engine";
import { sfx } from "./game/audio";

const DEFAULT_HUD: HudData = {
  state: "menu",
  score: 0,
  best: 0,
  lives: 3,
  level: 1,
  remaining: 0,
  total: 0,
  combo: 0,
  muted: false,
  current: 0,
  next: 1,
  bonus: 0,
};

interface BipEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* ── SVG-иконки ─────────────────────────────── */
const IconPause = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const IconSound = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {off ? (
      <path
        d="M16 9l5 6M21 9l-5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    ) : (
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    )}
  </svg>
);
const IconSwap = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 9a8 8 0 0 1 14-3l2 2" />
    <path d="M20 4v4h-4" />
    <path d="M20 15a8 8 0 0 1-14 3l-2-2" />
    <path d="M4 20v-4h4" />
  </svg>
);
const IconDownload = () => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
);
const Gem = ({ alive }: { alive: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4">
    <path
      d="M12 2l7 7-7 13L5 9z"
      fill={alive ? "#f5b83d" : "rgba(245,184,61,0.14)"}
      stroke={alive ? "#ffe9b8" : "rgba(245,184,61,0.3)"}
      strokeWidth="1.4"
    />
    {alive && <path d="M12 2l3.5 7L12 22 8.5 9z" fill="#ffd873" opacity="0.7" />}
  </svg>
);

/* ── шарик для DOM-интерфейса ───────────────── */
function MarbleDot({ color, size }: { color: string; size: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 33% 30%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0) 36%), ${color}`,
        boxShadow: `inset -2px -3px 5px rgba(0,0,0,0.5), 0 0 10px ${color}55`,
      }}
    />
  );
}

/* ═══════════════════════════════════════════════ */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<ZumaEngine | null>(null);
  const [hud, setHud] = useState<HudData>(DEFAULT_HUD);
  const [bipEvent, setBipEvent] = useState<BipEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  const isIOS =
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new ZumaEngine(canvas, setHud);
    gameRef.current = game;

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        sfx.ensure();
        game.fire();
      } else if (e.code === "KeyC" || e.code === "KeyX") {
        game.swap();
      } else if (e.code === "KeyP" || e.code === "Escape") {
        if (game.state === "playing" || game.state === "paused")
          game.togglePause();
      } else if (e.code === "KeyM") {
        game.toggleMute();
      } else if (e.code === "Enter" && game.state === "menu") {
        sfx.ensure();
        sfx.click();
        game.startGame();
      }
    };
    window.addEventListener("keydown", onKey);

    const onBip = (e: Event) => {
      e.preventDefault();
      setBipEvent(e as BipEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setBipEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const act = useCallback((fn: (g: ZumaEngine) => void) => {
    const g = gameRef.current;
    if (!g) return;
    sfx.ensure();
    sfx.click();
    fn(g);
  }, []);

  const handleInstall = useCallback(async () => {
    sfx.ensure();
    sfx.click();
    if (bipEvent) {
      await bipEvent.prompt();
      const choice = await bipEvent.userChoice;
      if (choice.outcome === "accepted") setBipEvent(null);
    } else if (isIOS) {
      setShowIosHint((v) => !v);
    }
  }, [bipEvent, isIOS]);

  const showInstall = !installed && !standalone && (bipEvent !== null || isIOS);
  const inGame =
    hud.state === "playing" ||
    hud.state === "paused" ||
    hud.state === "dying" ||
    hud.state === "levelclear";
  const progress =
    hud.total > 0 ? Math.max(0, Math.min(1, 1 - hud.remaining / hud.total)) : 0;
  const newRecord = hud.state === "gameover" && hud.score > 0 && hud.score >= hud.best;

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-[#04141a]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
      />

      {/* ── HUD ── */}
      {inGame && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-3">
          <div className="hud-chip btn-cut px-3 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#f5b83d]/70">
              Счёт
            </div>
            <div className="font-disp text-xl leading-tight text-[#ffe9b8] [text-shadow:0_0_14px_rgba(245,184,61,0.4)]">
              {hud.score}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-[#8fb8ac]">
              рекорд {hud.best}
            </div>
          </div>

          <div className="hud-chip btn-cut px-3 py-1.5 text-center">
            <div className="font-disp text-sm leading-tight text-[#2ee6a8]">
              УРОВЕНЬ {hud.level}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <MarbleDot color={MARBLE_COLORS[hud.current]} size={11} />
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#0a2b30] sm:w-28">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2ee6a8] to-[#f5b83d] transition-[width] duration-300"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-[#bfeee0]">
                {hud.remaining}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="hud-chip btn-cut flex items-center gap-1 px-2.5 py-1.5">
              {[0, 1, 2].map((i) => (
                <Gem key={i} alive={i < hud.lives} />
              ))}
            </div>
            <div className="pointer-events-auto flex gap-1.5">
              <button
                aria-label="Звук"
                className="hud-chip btn-cut flex h-9 w-9 items-center justify-center text-[#f5d488] transition hover:text-[#ffe9b8]"
                onClick={() => act((g) => g.toggleMute())}
              >
                <IconSound off={hud.muted} />
              </button>
              <button
                aria-label="Пауза"
                className="hud-chip btn-cut flex h-9 w-9 items-center justify-center text-[#f5d488] transition hover:text-[#ffe9b8]"
                onClick={() => act((g) => g.togglePause())}
              >
                {hud.state === "paused" ? <IconPlay /> : <IconPause />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* комбо */}
      {hud.state === "playing" && hud.combo >= 2 && (
        <div
          key={hud.combo}
          className="anim-combo pointer-events-none absolute inset-x-0 top-[max(4.6rem,calc(env(safe-area-inset-top)+4.2rem))] z-10 text-center"
        >
          <span className="font-disp text-3xl text-[#ffd873] [text-shadow:0_0_22px_rgba(245,184,61,0.8),0_3px_0_#3a2a08]">
            ×{hud.combo} КОМБО
          </span>
        </div>
      )}

      {/* кнопка смены шара */}
      {hud.state === "playing" && (
        <button
          aria-label="Сменить шар"
          onClick={() => act((g) => g.swap())}
          className="btn-cut hud-chip absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-10 flex h-16 w-16 flex-col items-center justify-center gap-0.5 text-[#f5d488] transition hover:text-[#ffe9b8] active:scale-95"
        >
          <MarbleDot color={MARBLE_COLORS[hud.next]} size={22} />
          <IconSwap />
        </button>
      )}

      {/* ── баннер уровня пройден ── */}
      {hud.state === "levelclear" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="anim-rise text-center">
            <div className="font-disp text-4xl text-[#2ee6a8] [text-shadow:0_0_28px_rgba(46,230,168,0.7),0_4px_0_#06352a] sm:text-5xl">
              УРОВЕНЬ {hud.level} ПРОЙДЕН
            </div>
            <div className="anim-rise anim-rise-1 font-disp mt-3 text-2xl text-[#ffd873] [text-shadow:0_0_18px_rgba(245,184,61,0.6)]">
              +{hud.bonus} БОНУС
            </div>
          </div>
        </div>
      )}

      {/* ── главное меню ── */}
      {hud.state === "menu" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(3,13,16,0.66)] p-4 backdrop-blur-[2px]">
          <div className="hud-chip panel-cut anim-rise w-full max-w-md px-6 py-7 text-center sm:px-8">
            <div className="mb-3 flex items-center justify-center gap-2">
              {MARBLE_COLORS.slice(0, 5).map((c) => (
                <MarbleDot key={c} color={c} size={13} />
              ))}
            </div>
            <div className="font-disp text-[11px] tracking-[0.4em] text-[#2ee6a8]">
              ЗУМА × ТРИ В РЯД
            </div>
            <h1 className="anim-title font-disp mt-2 text-5xl leading-none text-[#f5b83d] sm:text-6xl">
              ПУТЬ ЗМЕИ
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-[#bfeee0]/90">
              Цепь шаров ползёт к пасти змеи. Стреляй шарами, встраивай их в
              цепь и собирай <b className="text-[#ffe9b8]">3+ одного цвета</b>.
              Разрывы смыкаются — лови цепные комбо!
            </p>

            <button
              onClick={() => act((g) => g.startGame())}
              className="btn-gold btn-cut mx-auto mt-6 flex w-full max-w-[280px] items-center justify-center gap-2 px-8 py-3.5 text-xl"
            >
              <IconPlay />
              ИГРАТЬ
            </button>

            {showInstall && (
              <button
                onClick={handleInstall}
                className="btn-jade btn-cut mx-auto mt-3 flex w-full max-w-[280px] items-center justify-center gap-2 px-6 py-2.5 text-sm"
              >
                <IconDownload />
                УСТАНОВИТЬ НА ТЕЛЕФОН
              </button>
            )}
            {showIosHint && (
              <p className="anim-rise mx-auto mt-2 max-w-[300px] text-[11px] leading-snug text-[#8fb8ac]">
                На iPhone/iPad: кнопка <b>«Поделиться»</b> в Safari →
                <b> «На экран Домой»</b> — игра установится как приложение и
                будет работать офлайн.
              </p>
            )}
            {(installed || standalone) && (
              <p className="mt-2 text-[11px] text-[#2ee6a8]">
                Приложение установлено — можно играть офлайн
              </p>
            )}

            <div className="mx-auto mt-6 grid max-w-sm grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-left text-[12px] text-[#bfeee0]/85">
              <span className="kbd">ТАП / КЛИК</span>
              <span>выстрел шаром (прицел — движение)</span>
              <span className="kbd">ПРОБЕЛ</span>
              <span>выстрел с клавиатуры</span>
              <span className="kbd">C</span>
              <span>поменять шар местами со следующим</span>
              <span className="kbd">P</span>
              <span>пауза</span>
            </div>

            <div className="mt-5 flex items-center justify-center gap-4 text-[11px] uppercase tracking-widest text-[#8fb8ac]">
              {hud.best > 0 && (
                <span>
                  Рекорд:{" "}
                  <b className="font-disp text-sm text-[#ffe9b8]">{hud.best}</b>
                </span>
              )}
              <span className="text-[#2ee6a8]/70">PWA · офлайн</span>
            </div>
          </div>
        </div>
      )}

      {/* ── пауза ── */}
      {hud.state === "paused" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(3,13,16,0.7)] p-4 backdrop-blur-[2px]">
          <div className="hud-chip panel-cut anim-rise w-full max-w-xs px-6 py-7 text-center">
            <h2 className="font-disp text-3xl text-[#f5b83d] [text-shadow:0_0_20px_rgba(245,184,61,0.5)]">
              ПАУЗА
            </h2>
            <div className="mt-1 text-xs uppercase tracking-widest text-[#8fb8ac]">
              уровень {hud.level} · счёт {hud.score}
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={() => act((g) => g.togglePause())}
                className="btn-gold btn-cut flex items-center justify-center gap-2 px-6 py-3 text-base"
              >
                <IconPlay />
                ПРОДОЛЖИТЬ
              </button>
              <button
                onClick={() => act((g) => g.restart())}
                className="btn-ghost btn-cut px-6 py-2.5 text-sm"
              >
                ЗАНОВО
              </button>
              <button
                onClick={() => act((g) => g.toMenu())}
                className="btn-ghost btn-cut px-6 py-2.5 text-sm"
              >
                В МЕНЮ
              </button>
              <button
                onClick={() => act((g) => g.toggleMute())}
                className="btn-ghost btn-cut flex items-center justify-center gap-2 px-6 py-2.5 text-sm"
              >
                <IconSound off={hud.muted} />
                ЗВУК: {hud.muted ? "ВЫКЛ" : "ВКЛ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── поражение ── */}
      {hud.state === "gameover" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(10,4,8,0.72)] p-4 backdrop-blur-[2px]">
          <div className="hud-chip panel-cut anim-rise w-full max-w-sm px-6 py-8 text-center">
            <div className="font-disp text-[11px] tracking-[0.4em] text-[#ff3b5c]">
              ЗМЕЯ ДОТАЩИЛА ЦЕПЬ
            </div>
            <h2 className="font-disp mt-2 text-5xl text-[#ff5c77] [text-shadow:0_0_26px_rgba(255,59,92,0.6),0_4px_0_#3d0713]">
              ПОРАЖЕНИЕ
            </h2>
            {newRecord && (
              <div className="anim-record font-disp mt-3 inline-block border border-[#f5b83d]/50 bg-[#f5b83d]/10 px-3 py-1 text-sm text-[#ffd873]">
                НОВЫЙ РЕКОРД!
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="hud-chip btn-cut px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-[#8fb8ac]">
                  Счёт
                </div>
                <div className="font-disp text-2xl text-[#ffe9b8]">
                  {hud.score}
                </div>
              </div>
              <div className="hud-chip btn-cut px-3 py-3">
                <div className="text-[10px] uppercase tracking-widest text-[#8fb8ac]">
                  Рекорд
                </div>
                <div className="font-disp text-2xl text-[#f5b83d]">
                  {hud.best}
                </div>
              </div>
            </div>
            <div className="mt-2 text-xs text-[#8fb8ac]">
              пройден уровень {hud.level}
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={() => act((g) => g.restart())}
                className="btn-gold btn-cut px-6 py-3 text-base"
              >
                ЕЩЁ РАЗ
              </button>
              <button
                onClick={() => act((g) => g.toMenu())}
                className="btn-ghost btn-cut px-6 py-2.5 text-sm"
              >
                В МЕНЮ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
