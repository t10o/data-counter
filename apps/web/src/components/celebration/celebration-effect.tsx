import { type CSSProperties, useState } from "react";
import { CELEBRATION_DURATION_MS, type Celebration, type CelebrationKind } from "../../lib/celebration";
import { cn } from "../../lib/cn";
import { formatInteger } from "../../lib/format";
import { KIND_COLORS } from "../../lib/machine";

/** 種別が決まる前（灰色）の当たりに使う色 */
const FALLBACK_ACCENT: Readonly<Record<CelebrationKind, string>> = { bonus: "#f5b700", art: "#22d3ee" };

interface CelebrationEffectProps {
  celebration: Celebration;
  onDismiss: () => void;
}

/** 当たりの瞬間に画面いっぱいに出す演出。タップすると閉じる。動きと色は celebration.css */
export function CelebrationEffect({ celebration, onDismiss }: CelebrationEffectProps) {
  const { kind, color } = celebration;
  const accent = color === "gray" ? FALLBACK_ACCENT[kind] : KIND_COLORS[color];
  const { games } = celebration;
  const meta = games && [games.label, `${formatInteger(games.count)}G で当選`].filter(Boolean).join(" ");

  return (
    <div
      className={cn("celebration", kind === "bonus" ? "celebration-bonus" : "celebration-art")}
      style={cssVars({ "--accent": accent, "--duration": `${CELEBRATION_DURATION_MS[kind]}ms` })}
    >
      {kind === "bonus" ? (
        <BonusScene label={celebration.label} meta={meta} />
      ) : (
        <ArtScene label={celebration.label} meta={meta} />
      )}
      <button type="button" aria-label="演出を閉じる" className="absolute inset-0 opacity-0" onClick={onDismiss} />
      <p role="alert" className="sr-only">
        {headline(celebration)} {meta}
      </p>
    </div>
  );
}

interface SceneProps {
  label: string;
  meta: string | null;
}

/** ボーナス：金色の文字が 1 文字ずつ飛び込み、後ろで光が回る。最後の和音で紙吹雪 */
function BonusScene({ label, meta }: SceneProps) {
  const [confetti] = useState(makeConfetti);
  const letters = Array.from(label, (char, index) => ({ index, char: char === " " ? " " : char }));

  return (
    <>
      <div className="celebration-layer" aria-hidden="true">
        <div className="celebration-rays" />
        <div className="celebration-glow" />
        <div className="celebration-flash" />
        <div className="celebration-confetti">
          {confetti.map((piece) => (
            <i key={piece.id} style={piece.style} />
          ))}
        </div>
      </div>
      <div className="celebration-content" aria-hidden="true">
        <p className="celebration-bonus-title" style={cssVars({ "--chars": letters.length })}>
          {letters.map(({ index, char }) => (
            <span key={index} style={cssVars({ "--i": index })}>
              {char}
            </span>
          ))}
        </p>
        {!isBonusLabel(label) && <p className="celebration-bonus-sub">BONUS</p>}
        {meta && <p className="celebration-meta">{meta}</p>}
      </div>
    </>
  );
}

/** ART の輪が広がる時刻（秒）。音の打撃音に合わせる */
const RING_DELAYS = [0.7, 0.85, 1, 2.12, 2.27] as const;

/** ART：光をためてから、斜めの帯と文字が飛び込んで画面が揺れる。後ろを線が流れ続ける */
function ArtScene({ label, meta }: SceneProps) {
  const [streaks] = useState(makeStreaks);

  return (
    <>
      <div className="celebration-layer" aria-hidden="true">
        <div className="celebration-streaks">
          {streaks.map((streak) => (
            <i key={streak.id} style={streak.style} />
          ))}
        </div>
        <div className="celebration-core" />
        <div className="celebration-rings">
          {RING_DELAYS.map((delay) => (
            <i key={delay} style={cssVars({ "--delay": `${delay}s` })} />
          ))}
        </div>
        <div className="celebration-flash" />
      </div>
      <div className="celebration-art-stage" aria-hidden="true">
        <div className="celebration-band" />
        <div className="celebration-content">
          <p className="celebration-art-tag">{/ART/i.test(label) ? "START" : "ART START"}</p>
          <p className="celebration-art-title" style={cssVars({ "--chars": Array.from(label).length })}>
            {label}
          </p>
        </div>
        {meta && <p className="celebration-meta">{meta}</p>}
      </div>
    </>
  );
}

const isBonusLabel = (label: string): boolean => /BONUS/i.test(label);

/** 読み上げ用の一文 */
function headline({ kind, label }: Celebration): string {
  if (kind === "art") return `${label} ART 開始`;
  return isBonusLabel(label) ? `${label} 当選` : `${label} BONUS 当選`;
}

const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties => vars as CSSProperties;

const between = (min: number, max: number): number => min + Math.random() * (max - min);

const CONFETTI_COLORS = ["var(--accent)", "#ffd34d", "#ffffff", "color-mix(in oklab, var(--accent) 45%, white)"];

/** 紙吹雪。最後の和音（1.85 秒）から降らせる */
function makeConfetti() {
  return Array.from({ length: 56 }, (_, id) => ({
    id,
    style: cssVars({
      "--x": `${between(0, 100)}%`,
      "--size": `${between(0.4, 0.8)}rem`,
      "--color": CONFETTI_COLORS[id % CONFETTI_COLORS.length] ?? "white",
      "--fall": `${between(2.2, 3.6)}s`,
      "--delay": `${1.85 + between(0, 0.9)}s`,
      "--drift": `${between(-15, 15)}vw`,
      "--spin": `${between(540, 1440)}deg`,
    }),
  }));
}

/** ART の後ろを右から左へ流れる線 */
function makeStreaks() {
  return Array.from({ length: 32 }, (_, id) => ({
    id,
    style: cssVars({
      "--y": `${between(0, 100)}%`,
      "--length": `${between(10, 40)}vw`,
      "--thickness": `${between(1, 3.5)}px`,
      "--speed": `${between(0.3, 0.7)}s`,
      "--delay": `${between(0, 0.6)}s`,
    }),
  }));
}
