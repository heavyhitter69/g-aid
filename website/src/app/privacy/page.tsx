import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Privacy Policy — G-AID",
  description: "How G-AID handles information for the public website and local desktop app.",
};

const SECTIONS = [
  {
    id: "overview",
    heading: "1. Overview",
    body: (
      <>
        <p>
          G-AID is a local desktop workspace made by Genie Platforms. This policy describes the
          public website and, if you later enable optional account sign-in, that account data.
        </p>
        <p>
          Survey files you open in the desktop app stay on your machine. This site does not operate
          a billed cloud workspace or a payment processor.
        </p>
      </>
    ),
  },
  {
    id: "collection",
    heading: "2. Information We Collect",
    body: (
      <>
        <p>
          <strong>Website:</strong> Standard server logs may include IP address, user agent, and
          pages requested if this site is hosted. There is no analytics cookie banner and no
          advertising tracker on these pages.
        </p>
        <p>
          <strong>Optional accounts:</strong> If authentication is configured, sign-up may collect
          name, email, institution, role, and discipline. If authentication is not configured, the
          sign-in forms will say so instead of failing silently.
        </p>
        <p>
          <strong>Survey data:</strong> Geophysical files opened in the desktop app are not uploaded
          to this website as a product feature.
        </p>
        <p>
          <strong>Payments:</strong> G-AID does not process payments on this site.
        </p>
      </>
    ),
  },
  {
    id: "use",
    heading: "3. How We Use Your Information",
    body: (
      <ul className="list-disc list-inside space-y-2">
        <li>To operate this public website and, when configured, optional sign-in</li>
        <li>To respond if you contact us</li>
        <li>To meet legal obligations if they apply</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    heading: "4. Sharing of Information",
    body: (
      <p>
        We do not sell personal information. We do not share survey datasets through a hosted
        collaboration product because that product is not offered here.
      </p>
    ),
  },
  {
    id: "retention",
    heading: "5. Data Retention",
    body: (
      <p>
        Optional account records, when authentication is configured, are kept only while the
        account is used for sign-in. Local survey files are retained wherever you stored them.
      </p>
    ),
  },
  {
    id: "rights",
    heading: "6. Your Rights",
    body: (
      <p>
        You may ask what account data we hold, ask for correction or deletion, or withdraw consent
        for optional sign-in by emailing <span className="font-mono">privacy@g-aid.io</span>.
      </p>
    ),
  },
  {
    id: "cookies",
    heading: "7. Cookies",
    body: (
      <p>
        If optional authentication is configured, session cookies may be used to keep you signed in.
        This site does not use advertising cookies.
      </p>
    ),
  },
  {
    id: "security",
    heading: "8. Security",
    body: (
      <p>
        Treat this as a public research website plus a local desktop app. See the Security page for
        what we do and do not claim.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "9. Contact",
    body: (
      <p>
        Privacy questions: <span className="font-mono">privacy@g-aid.io</span>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="What this website and the local desktop app collect — and what they do not."
      lastUpdated="August 28, 2026"
      sections={SECTIONS}
    />
  );
}
