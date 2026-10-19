import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { PIN_FILLED, type IconDef } from '../shared/icons';
import { formatTime } from '../shared/time';
import type { Video } from '../shared/types';
import { thumbnailUrl } from '../shared/youtube';
import { videoProgress } from '../shared/progress';

/** Renders one of the icons of `shared/icons.ts` in the current text color. */
export function Icon({ icon, className }: { icon: IconDef; className?: string }) {
  return (
    <svg
      viewBox={icon.viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.paths.map(({ d, fill, stroke }) => (
        <path
          key={d}
          d={d}
          fill={fill ? 'currentColor' : 'none'}
          stroke={stroke ? 'currentColor' : undefined}
          strokeWidth={stroke}
        />
      ))}
    </svg>
  );
}

/** The PinTube pin. */
export function PinIcon({ className }: { className?: string }) {
  return <Icon icon={PIN_FILLED} className={className} />;
}

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark">
        <PinIcon />
      </span>
      PinTube
    </span>
  );
}

const CONFIRM_TIMEOUT_MS = 3000;

/**
 * A destructive button that asks for a second click instead of opening a
 * dialog (native dialogs are unreliable inside extension popups). While it
 * waits, its fill drains away to show how long the confirmation stays on offer.
 */
export function ConfirmButton({
  className = '',
  label,
  confirmLabel,
  onConfirm,
  children,
}: {
  className?: string;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  children: ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), CONFIRM_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`btn ${className}${armed ? ' btn-danger-solid' : ''}`}
      aria-label={armed ? confirmLabel : label}
      title={armed ? confirmLabel : label}
      style={armed ? ({ '--confirm-time': `${CONFIRM_TIMEOUT_MS}ms` } as CSSProperties) : undefined}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

export function ProgressBar({ value, done = false, label }: { value: number; done?: boolean; label?: string }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={done ? 'progress progress-done' : 'progress'}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

export function VideoThumb({ video, width }: { video: Video; width: number }) {
  return (
    <div className="thumb" style={{ width }}>
      <img src={thumbnailUrl(video.id)} alt="" loading="lazy" referrerPolicy="no-referrer" />
      {video.duration > 0 && <span className="thumb-time">{formatTime(video.duration)}</span>}
      <ProgressBar value={videoProgress(video)} done={video.completed} />
    </div>
  );
}
