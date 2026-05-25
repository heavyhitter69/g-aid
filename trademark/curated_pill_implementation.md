# Curated by Dev Pill - Implementation Guide

This document captures the exact Next.js implementation and CSS for the "Curated by | dev" footer pill used in the Joey The Brand portfolio. You can drop this directly into other Next.js projects.

## Dependencies

- **`next/image`**: Standard Next.js component used to render the emoji without browser optimization distorting the transparent edge.
- **Icon Graphic**: It uses a local asset, e.g., `/emoji-genie-apple.png`.

## React Implementation

Here is the standalone functional component. It accepts a `devHref` prop; if provided it turns into a clickable anchored link, otherwise it stays a static pill.

```tsx
import Image from "next/image";
import styles from "./CuratedPill.module.css";

const CuratedInner = () => (
  <>
    <span className={styles.curatedLabel}>Curated by</span>
    <Image
      src="/emoji-genie-apple.png"
      alt="Developer emoji"
      width={24}
      height={24}
      className={styles.genieImg}
      aria-hidden
      unoptimized
    />
    <span className={styles.curatedSep}>|</span>
    <span className={styles.devWord}>dev</span>
  </>
);

export function CuratedPill({ devHref }: { devHref: string | null }) {
  if (devHref) {
    return (
      <a
        href={devHref}
        className={styles.curatedPill}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Developer portfolio — curated by"
      >
        <CuratedInner />
      </a>
    );
  }
  return (
    <span className={`${styles.curatedPill} ${styles.curatedPillInactive}`} title="Developer Portfolio">
      <CuratedInner />
    </span>
  );
}
```

## CSS Modules (`CuratedPill.module.css`)

This produces the exact hover effects, inset tracking lines, and glassmorphic look from the original styling:

```css
/* Instagram-style pill: pops on hover */
.curatedPill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.45rem;
  min-height: 2.75rem;
  padding: 0.45rem 1.15rem 0.5rem;
  border-radius: 999px;
  text-decoration: none;
  color: rgba(245, 241, 236, 0.92);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow:
    0 0 0 1px rgba(145, 126, 113, 0.12) inset,
    0 4px 14px rgba(0, 0, 0, 0.12);
  transition:
    color 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.curatedPill:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(145, 126, 113, 0.45);
  transform: translateY(-2px);
  box-shadow:
    0 0 0 1px rgba(145, 126, 113, 0.2) inset,
    0 8px 22px rgba(0, 0, 0, 0.18);
}

.curatedPill:focus-visible {
  outline: 2px solid rgba(145, 126, 113, 1);
  outline-offset: 3px;
}

.curatedPillInactive {
  cursor: default;
  opacity: 0.88;
  transform: none;
  box-shadow:
    0 0 0 1px rgba(145, 126, 113, 0.08) inset,
    0 2px 10px rgba(0, 0, 0, 0.08);
}

.curatedPillInactive:hover {
  transform: none;
  color: rgba(245, 241, 236, 0.92);
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.14);
  box-shadow:
    0 0 0 1px rgba(145, 126, 113, 0.12) inset,
    0 4px 14px rgba(0, 0, 0, 0.12);
}

.curatedLabel {
  font-family: system-ui, sans-serif;
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.genieImg {
  display: block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
}

.curatedSep {
  opacity: 0.5;
  letter-spacing: 0.08em;
  font-family: system-ui, sans-serif;
  font-size: 0.65rem;
}

.devWord {
  font-family: system-ui, sans-serif;
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
```
