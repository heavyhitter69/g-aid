import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Privacy Policy — G-AID",
  description: "How G-AID collects, uses, and protects your personal information.",
};

const SECTIONS = [
  {
    id: "overview",
    heading: "1. Overview",
    body: (
      <>
        <p>G-AID ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform.</p>
        <p>By using the Service, you consent to the data practices described in this policy. If you do not agree with the terms of this Privacy Policy, please do not access the Service.</p>
      </>
    ),
  },
  {
    id: "collection",
    heading: "2. Information We Collect",
    body: (
      <>
        <p><strong>Account information:</strong> Name, email address, institution, and professional role collected at registration.</p>
        <p><strong>Usage data:</strong> Log data including IP address, browser type, pages visited, time spent, and feature interactions — collected automatically via server logs and analytics.</p>
        <p><strong>Project data:</strong> Geophysical datasets, workflow configurations, and project files you upload or create within the platform.</p>
        <p><strong>AI interaction logs:</strong> Prompts and outputs from your interactions with the AI agent panel, retained to improve service quality and provide conversation history.</p>
        <p><strong>Payment information:</strong> Billing details are processed by our payment provider (Stripe) and are not stored on our servers.</p>
      </>
    ),
  },
  {
    id: "use",
    heading: "3. How We Use Your Information",
    body: (
      <ul className="list-disc list-inside space-y-2">
        <li>Providing, operating, and maintaining the Service</li>
        <li>Personalising your experience and calibrating AI agents to your discipline</li>
        <li>Sending transactional emails, security alerts, and product updates</li>
        <li>Analysing aggregate usage patterns to improve the platform</li>
        <li>Complying with legal obligations and enforcing our Terms of Service</li>
        <li>Detecting and preventing fraud, abuse, or security incidents</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    heading: "4. Sharing of Information",
    body: (
      <>
        <p>We do not sell your personal information. We may share information with:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>Service providers:</strong> Trusted vendors who assist in operating the platform (cloud hosting, analytics, email delivery) under confidentiality agreements</li>
          <li><strong>Legal authorities:</strong> When required by law, court order, or to protect our rights or the safety of others</li>
          <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, with prior notice to affected users</li>
        </ul>
      </>
    ),
  },
  {
    id: "retention",
    heading: "5. Data Retention",
    body: (
      <p>We retain your account data for as long as your account is active or as needed to provide the Service. Project data is retained for 90 days after account deletion. AI interaction logs are anonymised after 12 months. You may request earlier deletion by contacting us at <span className="font-mono">privacy@g-aid.io</span>.</p>
    ),
  },
  {
    id: "rights",
    heading: "6. Your Rights",
    body: (
      <>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Access and receive a copy of the personal data we hold about you</li>
          <li>Correct inaccurate or incomplete personal data</li>
          <li>Request deletion of your personal data ("right to be forgotten")</li>
          <li>Object to or restrict certain processing activities</li>
          <li>Data portability — receive your data in a machine-readable format</li>
          <li>Withdraw consent at any time where processing is based on consent</li>
        </ul>
        <p className="mt-3">To exercise these rights, email <span className="font-mono">privacy@g-aid.io</span>. We will respond within 30 days.</p>
      </>
    ),
  },
  {
    id: "cookies",
    heading: "7. Cookies",
    body: (
      <p>We use strictly necessary cookies for authentication and session management, and optional analytics cookies (with your consent) to understand how the platform is used. You can manage cookie preferences in your browser settings. Disabling analytics cookies does not affect core functionality.</p>
    ),
  },
  {
    id: "security",
    heading: "8. Security",
    body: (
      <p>We implement industry-standard security measures including TLS encryption in transit, AES-256 encryption at rest, role-based access controls, and regular third-party penetration testing. No method of transmission over the internet is 100% secure; we cannot guarantee absolute security.</p>
    ),
  },
  {
    id: "contact",
    heading: "9. Contact",
    body: (
      <p>For privacy-related enquiries, contact our Data Protection Officer at <span className="font-mono">privacy@g-aid.io</span> or write to: G-AID, Attn: Privacy, [Address].</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your personal information."
      lastUpdated="May 25, 2026"
      sections={SECTIONS}
    />
  );
}
