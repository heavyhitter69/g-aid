import Image from "next/image";

const CuratedInner = () => (
  <>
    <Image
      src="/trademark/emoji-genie-apple.png"
      alt="Developer emoji"
      width={24}
      height={24}
      className="curated-genie-img"
      aria-hidden
      unoptimized
    />
    <span className="curated-sep">|</span>
    <span className="curated-dev-word">dev</span>
  </>
);

export function CuratedPill({ devHref }: { devHref: string | null }) {
  if (devHref) {
    return (
      <a
        href={devHref}
        className="curated-pill"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Developer portfolio"
      >
        <CuratedInner />
      </a>
    );
  }
  return (
    <span className="curated-pill curated-pill-inactive" title="Developer Portfolio">
      <CuratedInner />
    </span>
  );
}
