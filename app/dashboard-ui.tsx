"use client";

import type { ReactNode } from "react";

export type DashboardTone =
  | "neutral"
  | "indigo"
  | "emerald"
  | "amber"
  | "rose";

export function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="info-tooltip">
      <button type="button" aria-label={label} aria-describedby={label}>
        ?
      </button>
      <span id={label} role="tooltip">
        {children}
      </span>
    </span>
  );
}

export function MetricStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: DashboardTone;
}) {
  return (
    <span className={`metric-status metric-status-${tone}`}>
      <i aria-hidden="true" />
      {label}
    </span>
  );
}

export function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const selected = new Set(values);
  const summary =
    values.length === 0
      ? `All ${label.toLowerCase()}`
      : values.length === 1
        ? values[0]
        : `${values.length} selected`;
  return (
    <details className="multi-filter">
      <summary>
        <span>{label}</span>
        <strong>{summary}</strong>
      </summary>
      <div className="multi-filter-menu">
        <div>
          <span>{label}</span>
          {values.length ? (
            <button type="button" onClick={() => onChange([])}>
              Clear
            </button>
          ) : null}
        </div>
        <div className="multi-filter-options">
          {options.length ? (
            options.map((option) => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={selected.has(option)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...values, option]
                        : values.filter((value) => value !== option),
                    )
                  }
                />
                <span>{option}</span>
              </label>
            ))
          ) : (
            <p>No options in the current workbook.</p>
          )}
        </div>
      </div>
    </details>
  );
}

export function EmptyPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="panel-empty" role="status">
      <span aria-hidden="true">◇</span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export function LoadingSkeleton({
  label = "Loading verified analytics",
}: {
  label?: string;
}) {
  return (
    <div className="dashboard-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton-line skeleton-title" />
      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorPanel({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="dashboard-error-panel" role="alert">
      <span aria-hidden="true">!</span>
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {action}
    </section>
  );
}

export function TableFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="designed-table table-frame" role="region" aria-label={label}>
      {children}
    </div>
  );
}

export function SidePanel({
  label,
  title,
  onClose,
  modal = false,
  children,
}: {
  label: string;
  title: string;
  onClose?: () => void;
  modal?: boolean;
  children: ReactNode;
}) {
  return (
    <aside
      className="side-panel glass-panel"
      aria-label={label}
      aria-modal={modal || undefined}
      role={modal ? "dialog" : undefined}
    >
      <header>
        <div>
          <span>{label}</span>
          <h2>{title}</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            className="side-panel-close"
            onClick={onClose}
            aria-label={`Close ${label}`}
          >
            ×
          </button>
        ) : null}
      </header>
      {children}
    </aside>
  );
}
