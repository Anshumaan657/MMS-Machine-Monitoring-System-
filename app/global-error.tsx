"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="empty-shell">
          <section className="glass-panel empty-state" role="alert">
            <h1>3D Intelligence needs to restart this view.</h1>
            <p>No workbook or MMS database record has been modified.</p>
            <button className="button button-primary" onClick={reset}>
              Restart view
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
