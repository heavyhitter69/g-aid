import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Terms of Service — G-AID",
  description: "Terms for the G-AID public website and local desktop workspace.",
};

const SECTIONS = [
  {
    id: "acceptance",
    heading: "1. Acceptance of Terms",
    body: (
      <p>
        By using this website or the G-AID desktop application, you agree to these Terms. If you
        do not agree, do not use the software.
      </p>
    ),
  },
  {
    id: "description",
    heading: "2. Description of Service",
    body: (
      <>
        <p>
          G-AID is a local desktop workspace for supported geophysical survey files. The public
          website describes that software. It is not a hosted interpretation SaaS, a payment
          product, or a general-availability installer channel until a GitHub Release exists.
        </p>
        <p>
          Outputs are provided as-is. You must validate scientific results before professional use.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "3. Accounts",
    body: (
      <p>
        Optional email/password accounts exist for desktop sign-in when authentication is
        configured. If it is not configured, account creation is unavailable. Social login is not
        offered.
      </p>
    ),
  },
  {
    id: "data",
    heading: "4. Your Data and Content",
    body: (
      <p>
        You retain rights to files on your disks. Opening a folder in G-AID does not grant Genie
        Platforms a licence to host or resell those files.
      </p>
    ),
  },
  {
    id: "prohibited",
    heading: "5. Prohibited Uses",
    body: (
      <ul className="list-disc list-inside space-y-2">
        <li>Processing data you are not authorised to use</li>
        <li>Attempting to disrupt this website or other users&apos; machines</li>
        <li>Misrepresenting G-AID outputs as certified cloud-hosted results</li>
      </ul>
    ),
  },
  {
    id: "ip",
    heading: "6. Intellectual Property",
    body: (
      <p>
        The G-AID software and this website are owned by Genie Platforms. These Terms do not
        transfer ownership of that software to you.
      </p>
    ),
  },
  {
    id: "termination",
    heading: "7. Termination",
    body: (
      <p>
        We may stop offering this website or optional accounts. Your local files remain yours.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "8. Limitation of Liability",
    body: (
      <p>
        To the maximum extent permitted by law, G-AID and Genie Platforms are not liable for
        indirect or consequential damages, including professional decisions made from experimental
        or incomplete processing packs. If a court finds liability, it is limited to USD $100 or
        the amount you paid us (currently none via this site), whichever is greater.
      </p>
    ),
  },
  {
    id: "governing-law",
    heading: "9. Governing Law",
    body: (
      <p>
        These Terms are governed by the laws applicable to Genie Platforms, without regard to
        conflict-of-law rules.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "10. Contact",
    body: (
      <p>
        Questions: <span className="font-mono">legal@g-aid.io</span>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="Terms for the public website and the local G-AID desktop workspace."
      lastUpdated="August 28, 2026"
      sections={SECTIONS}
    />
  );
}
