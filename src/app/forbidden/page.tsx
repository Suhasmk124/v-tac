import Link from "next/link";
export default function Forbidden() {
  return (
    <main className="content">
      <p className="eyebrow">HEAD COACH ACCESS</p>
      <h1>
        This desk needs
        <br />
        <span>a coach account.</span>
      </h1>
      <p className="subtle">
        Scout accounts can explore match history and tactical research. A Head
        Coach can manage team rosters.
      </p>
      <Link className="button" href="/">
        Return to workspace →
      </Link>
    </main>
  );
}
