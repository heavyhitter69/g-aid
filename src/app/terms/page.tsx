import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Terms of Service — G-AID",
  description: "G-AID Terms of Service: your rights and obligations when using the platform.",
};

const SECTIONS = [
  {
    id: "acceptance",
    heading: "1. Acceptance of Terms",
    body: (
      <>
        <p>By accessing or using the G-AID platform (the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.</p>
        <p>These Terms apply to all users of the Service, including without limitation users who are browsers, customers, merchants, and contributors of content. We reserve the right to update these Terms at any time, and will notify you of material changes via email or prominent notice within the platform.</p>
      </>
    ),
  },
  {
    id: "description",
    heading: "2. Description of Service",
    body: (
      <>
        <p>G-AID (Geophysics - Agent Iteration Domain) is an AI-assisted geophysical interpretation platform that provides tools for subsurface data analysis, workflow automation, and multi-agent scientific computing.</p>
        <p>The Service is provided "as is" and we make no warranties, express or implied, regarding the accuracy of AI-generated interpretations. Users are responsible for validating all outputs against ground-truth data before use in any professional context.</p>
      </>
    ),
  },
  {
    id: "accounts",
    heading: "3. User Accounts",
    body: (
      <>
        <p>You must create an account to access certain features of the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
        <p>You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete. We reserve the right to terminate accounts that contain false or misleading information.</p>
      </>
    ),
  },
  {
    id: "data",
    heading: "4. Your Data and Content",
    body: (
      <>
        <p>You retain all rights to the geophysical datasets, project files, and other content you upload to the Service ("User Content"). By uploading User Content, you grant G-AID a limited, non-exclusive licence to process and store that content solely for the purpose of providing the Service to you.</p>
        <p>You represent and warrant that you have all necessary rights to upload your User Content and that doing so does not violate any third-party rights or applicable law.</p>
      </>
    ),
  },
  {
    id: "prohibited",
    heading: "5. Prohibited Uses",
    body: (
      <ul className="list-disc list-inside space-y-2">
        <li>Using the Service to process data for which you do not have authorisation</li>
        <li>Attempting to reverse-engineer or extract the underlying AI models</li>
        <li>Uploading malicious code, malware, or content designed to disrupt the Service</li>
        <li>Reselling or sublicensing access to the Service without prior written consent</li>
        <li>Using the Service to generate content that violates applicable laws or regulations</li>
      </ul>
    ),
  },
  {
    id: "ip",
    heading: "6. Intellectual Property",
    body: (
      <>
        <p>The Service, including all software, algorithms, workflows, and documentation, is owned by G-AID and protected by intellectual property laws. Nothing in these Terms grants you ownership of any G-AID intellectual property.</p>
        <p>AI-generated outputs produced by the Service may be used by you for lawful professional purposes. G-AID does not claim ownership over interpretations generated on your behalf.</p>
      </>
    ),
  },
  {
    id: "termination",
    heading: "7. Termination",
    body: (
      <p>We may suspend or terminate your access to the Service at our discretion, with or without notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties. Upon termination, your right to use the Service ceases immediately. Sections 4, 6, 8, and 9 survive termination.</p>
    ),
  },
  {
    id: "liability",
    heading: "8. Limitation of Liability",
    body: (
      <>
        <p>To the maximum extent permitted by applicable law, G-AID shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of or inability to use the Service.</p>
        <p>Our total cumulative liability to you for any claims arising under these Terms shall not exceed the greater of (a) the amounts you paid to us in the twelve months preceding the claim, or (b) USD $100.</p>
      </>
    ),
  },
  {
    id: "governing-law",
    heading: "9. Governing Law",
    body: (
      <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which G-AID is incorporated, without regard to its conflict of law provisions. Any disputes shall be resolved by binding arbitration in accordance with the rules of a mutually agreed arbitration body.</p>
    ),
  },
  {
    id: "contact",
    heading: "10. Contact",
    body: (
      <p>If you have questions about these Terms, please contact us at <span className="font-mono">legal@g-aid.io</span>.</p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="Please read these terms carefully before using the G-AID platform."
      lastUpdated="May 25, 2026"
      sections={SECTIONS}
    />
  );
}
