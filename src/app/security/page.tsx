import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Security — G-AID",
  description: "G-AID security practices: infrastructure, encryption, compliance, and vulnerability disclosure.",
};

const SECTIONS = [
  {
    id: "overview",
    heading: "1. Security Overview",
    body: (
      <p>Security is a core principle at G-AID, not an afterthought. We design our infrastructure, development practices, and access controls with the assumption that threats exist at every layer. This page outlines the measures we take to protect your data and the platform.</p>
    ),
  },
  {
    id: "infrastructure",
    heading: "2. Infrastructure Security",
    body: (
      <>
        <p>G-AID runs on ISO 27001-certified cloud infrastructure with the following controls in place:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Network segmentation and private VPC architecture — no public exposure of internal services</li>
          <li>Web Application Firewall (WAF) protecting all public-facing endpoints</li>
          <li>Distributed Denial of Service (DDoS) mitigation at the network edge</li>
          <li>Immutable infrastructure deployments — servers are never patched in place</li>
          <li>Automated vulnerability scanning of container images on every build</li>
          <li>Intrusion detection systems with 24/7 alerting</li>
        </ul>
      </>
    ),
  },
  {
    id: "encryption",
    heading: "3. Encryption",
    body: (
      <>
        <p><strong>In transit:</strong> All data between your browser and our servers is encrypted using TLS 1.3. Older protocol versions (TLS 1.0, 1.1) are disabled. We enforce HTTP Strict Transport Security (HSTS).</p>
        <p><strong>At rest:</strong> All stored data — including uploaded datasets, project files, and database records — is encrypted using AES-256. Encryption keys are managed via Hardware Security Modules (HSMs).</p>
        <p><strong>Customer-managed keys:</strong> Enterprise customers may bring their own encryption keys (BYOK) via our key management integration.</p>
      </>
    ),
  },
  {
    id: "access",
    heading: "4. Access Control",
    body: (
      <>
        <p>We follow the principle of least privilege across the organisation:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Role-based access control (RBAC) for all internal systems</li>
          <li>Multi-factor authentication (MFA) required for all employee accounts</li>
          <li>Just-in-time (JIT) privileged access for production environment — no standing admin access</li>
          <li>All production access events are logged and reviewed in quarterly audits</li>
          <li>Employee access to customer data requires explicit approval and is logged</li>
        </ul>
      </>
    ),
  },
  {
    id: "sdlc",
    heading: "5. Secure Development",
    body: (
      <>
        <p>Security is integrated throughout our software development lifecycle:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Mandatory security review for features handling user data</li>
          <li>Automated static analysis (SAST) and dependency vulnerability scanning on every pull request</li>
          <li>Annual third-party penetration tests against the full platform surface</li>
          <li>Bug bounty programme via responsible disclosure (see below)</li>
          <li>Developer security training updated annually</li>
        </ul>
      </>
    ),
  },
  {
    id: "compliance",
    heading: "6. Compliance",
    body: (
      <>
        <p>G-AID maintains the following certifications and attestations:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li><strong>SOC 2 Type II</strong> — annual audit covering Security, Availability, and Confidentiality trust service criteria</li>
          <li><strong>GDPR</strong> — compliant data processing agreements available for EU customers</li>
          <li><strong>ISO 27001</strong> — infrastructure hosted in certified facilities</li>
        </ul>
        <p className="mt-3">Customers may request our latest SOC 2 report under NDA by contacting <span className="font-mono">security@g-aid.io</span>.</p>
      </>
    ),
  },
  {
    id: "incidents",
    heading: "7. Incident Response",
    body: (
      <>
        <p>We maintain a documented incident response plan that includes:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>24/7 on-call security rotation with defined escalation paths</li>
          <li>Incident classification (P0–P3) with response SLAs</li>
          <li>Customer notification within 72 hours of a confirmed breach affecting their data, in accordance with GDPR requirements</li>
          <li>Post-incident reports shared with affected customers upon request</li>
        </ul>
      </>
    ),
  },
  {
    id: "disclosure",
    heading: "8. Vulnerability Disclosure",
    body: (
      <>
        <p>We welcome reports from the security research community. If you discover a vulnerability in G-AID, please report it responsibly:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Email: <span className="font-mono">security@g-aid.io</span></li>
          <li>PGP key available at <span className="font-mono">g-aid.io/.well-known/security.txt</span></li>
          <li>We will acknowledge receipt within 2 business days and provide a resolution timeline within 10 business days</li>
          <li>We do not pursue legal action against researchers who act in good faith under this policy</li>
        </ul>
      </>
    ),
  },
  {
    id: "contact",
    heading: "9. Contact",
    body: (
      <p>For security concerns or to request a copy of our SOC 2 report, contact <span className="font-mono">security@g-aid.io</span>.</p>
    ),
  },
];

export default function SecurityPage() {
  return (
    <LegalLayout
      title="Security"
      subtitle="Our infrastructure, access controls, encryption practices, and responsible disclosure policy."
      lastUpdated="May 25, 2026"
      sections={SECTIONS}
    />
  );
}
