import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function SectionHeading({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h3 className="font-display text-[15px] font-semibold tracking-tight">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** A grouped card of rows, like a native settings list. */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", className)}>
      {children}
    </div>
  );
}

export function Row({
  icon,
  label,
  description,
  control,
  onClick,
  danger,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  description?: string;
  control?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground", danger && "bg-destructive/10 text-destructive")}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-sm font-medium", danger && "text-destructive")}>{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span> : null}
      </span>
      {control ? <span className="shrink-0">{control}</span> : null}
    </>
  );
  const base = "flex w-full items-center gap-3 px-3.5 py-3";
  return onClick ? (
    <button type="button" disabled={disabled} onClick={onClick} className={cn(base, "transition-colors hover:bg-secondary/60 active:bg-secondary disabled:opacity-50")}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}

export function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row
      icon={icon}
      label={label}
      description={description}
      control={<Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />}
    />
  );
}

/** Segmented control with a clear selected pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-full px-3 py-1.5 text-xs font-medium transition-all disabled:opacity-40",
            value === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A selectable tile with a ring and an animated check. */
export function OptionTile({
  selected,
  onClick,
  label,
  children,
  disabled,
  badge,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
  badge?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("hub-tile p-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50", className)}
    >
      {children}
      <span className="hub-tile__check" aria-hidden>
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5 text-[11px] font-medium">
        <span className="truncate">{label}</span>
        {badge ? <span className="rounded bg-primary/15 px-1 text-[8px] font-bold tracking-wide text-primary">{badge}</span> : null}
      </span>
    </button>
  );
}

export function ColorSwatch({ color, selected, onClick, label }: { color: string; selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className="hub-tile grid size-9 place-items-center rounded-full p-0"
      style={{ background: color }}
    >
      <span className="hub-tile__check !static" style={{ transform: selected ? "scale(1)" : "scale(0)" }} aria-hidden>
        <Check className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "%",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block px-3.5 py-3">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium">
        {label}
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        className="hub-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
