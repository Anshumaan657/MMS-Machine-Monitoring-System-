"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty-shell">
      <section className="glass-panel empty-state" role="alert">
        <span className="eyebrow">Safe recovery</span>
        <h1>The dashboard could not finish this operation.</h1>
        <p>
          Your source workbook remains unchanged. Retry the dashboard, or
          reconnect the workbook if the problem continues.
        </p>
        <button className="button button-primary" onClick={reset}>
          Retry dashboard
        </button>
      </section>
    </main>
  );
}
