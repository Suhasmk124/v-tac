"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error">
      <p className="eyebrow">WORKSPACE UNAVAILABLE</p>
      <h1>Connection interrupted.</h1>
      <p>
        Check that PostgreSQL is running and the database has been migrated. If
        you just signed in, verify your session configuration.
      </p>
      <button onClick={reset}>Try again</button>{" "}
      <a href="/login">Return to sign in</a>
    </main>
  );
}
