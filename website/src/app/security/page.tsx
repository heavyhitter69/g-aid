import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Security — G-AID",
  description: "Honest security notes for the G-AID website and local desktop app.",
};

const SECTIONS = [
  {
    id: "overview",
    heading: "1. Security Overview",
    body: (
      <p>
        G-AID is a local desktop workspace plus this public website. This page describes that
        reality. It does not claim certifications or controls that are not in place.
      </p>
    ),
  },
  {
    id: "desktop",
    heading: "2. Desktop application",
    body: (
      <>
        <p>
          Survey files remain in folders you open on disk. Optional local AI uses Ollama on the
          same machine. There is no hosted model API on this site.
        </p>
        <p>
          Keep the desktop app and operating system updated. Do not treat experimental invert2d or
          unfinished packs as production-validated science.
        </p>
      </>
    ),
  },
  {
    id: "website",
    heading: "3. Public website",
    body: (
      <p>
        These pages are informational. Download links only redirect when a real GitHub Release
        asset exists. Internal desktop QA routes are not part of public navigation.
      </p>
    ),
  },
  {
    id: "accounts",
    heading: "4. Accounts",
    body: (
      <p>
        Optional email/password sign-in exists in code for the desktop handoff. If authentication
        is not configured in the environment, the forms show an unavailable state instead of a
        generic error. Third-party social login is not offered.
      </p>
    ),
  },
  {
    id: "not-claimed",
    heading: "5. What we do not claim",
    body: (
      <ul className="list-disc list-inside space-y-2">
        <li>No compliance audit reports are offered from this site</li>
        <li>No customer-managed key product</li>
        <li>No 24/7 SOC or bug-bounty programme is advertised here</li>
        <li>No payment processing</li>
      </ul>
    ),
  },
  {
    id: "disclosure",
    heading: "6. Vulnerability reports",
    body: (
      <p>
        If you find a security issue in G-AID, email <span className="font-mono">security@g-aid.io</span>.
        Please do not test against systems you do not own.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "7. Contact",
    body: (
      <p>
        Security questions: <span className="font-mono">security@g-aid.io</span>.
      </p>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalLayout
      title="Security"
      subtitle="Local desktop software and a public information site — without invented certifications."
      lastUpdated="August 28, 2026"
      sections={SECTIONS}
    />
  );
}
