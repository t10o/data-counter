import { Volume2, VolumeX } from "lucide-react";
import { useId } from "react";
import { celebrationSettings, useCelebrationSettings } from "../../lib/celebration";
import { fanfare, useFanfareReady } from "../../lib/fanfare";

/** ヘッダーに置く、当たりの演出の設定（音と画面の演出のオン・オフ） */
export function CelebrationMenu() {
  const popoverId = useId();
  const settings = useCelebrationSettings();
  const ready = useFanfareReady();

  // 再読み込みした直後は、画面を一度触るまで音が出ない
  const locked = settings.sound && !ready;
  const Icon = settings.sound ? Volume2 : VolumeX;
  const title = locked ? "当たりの演出（画面を一度タップすると音が鳴るようになります）" : "当たりの演出";

  return (
    <>
      <button
        type="button"
        popoverTarget={popoverId}
        aria-label={title}
        title={title}
        className="relative flex size-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
      >
        <Icon className="size-4" aria-hidden="true" />
        {locked && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400" aria-hidden="true" />}
      </button>

      {/* popover の外側に display を付けると、閉じていても出てしまうので、並べ方は内側の要素で決める */}
      <div
        id={popoverId}
        popover="auto"
        className="fixed inset-auto top-14 right-[max(1rem,calc((100vw-80rem)/2+1.5rem))] m-0 w-72 rounded-2xl bg-zinc-900 p-4 text-zinc-100 shadow-2xl ring-1 shadow-black/50 ring-white/10"
      >
        <div className="grid gap-3">
          <div>
            <h2 className="text-sm font-semibold">当たりの演出</h2>
            <p className="mt-0.5 text-xs text-zinc-500">ボーナスと ART で演出が変わります</p>
          </div>

          <div className="grid">
            <Switch
              label="画面の演出"
              checked={settings.effects}
              onChange={(effects) => celebrationSettings.update({ effects })}
            />
            <Switch
              label="ファンファーレ"
              checked={settings.sound}
              onChange={(sound) => {
                if (sound) fanfare.unlock();
                celebrationSettings.update({ sound });
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-full bg-zinc-700 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-zinc-300 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  );
}
