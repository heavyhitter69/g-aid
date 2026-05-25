import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Data Use — G-AID",
  description: "How G-AID handles, processes, and stores geophysical data on the platform.",
};

const SECTIONS = [
  {
    id: "purpose",
    heading: "1. Purpose of This Document",
    body: (
      <p>This Data Use Policy describes specifically how G-AID handles the scientific datasets, project files, and AI-generated outputs that users create or upload within the platform. It supplements our Privacy Policy, which covers personal data about individual users.</p>
    ),
  },
  {
    id: "ownership",
    heading: "2. Data Ownership",
    body: (
      <>
        <p>You retain full ownership of all geophysical data you upload, including seismic files, resistivity profiles, gravity grids, well logs, and any other raw or processed datasets.</p>
        <p>AI-generated interpretations, inversion results, and workflow outputs produced by the Service on your data are also considered your intellectual property. G-AID does not claim ownership of any data or outputs produced within your account.</p>
      </>
    ),
  },
  {
    id: "processing",
    heading: "3. How We Process Your Data",
    body: (
      <>
        <p>Your data is processed solely for the purpose of delivering the Service to you. Processing activities include:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Storing uploaded files in encrypted cloud object storage</li>
          <li>Running inversion algorithms and AI interpretation models on your datasets</li>
          <li>Generating visualisations, reports, and interpretation summaries</li>
          <li>Syncing project state across collaborative sessions (where enabled)</li>
        </ul>
        <p className="mt-3">We do not use your proprietary scientific data to train, fine-tune, or evaluate our AI models without your explicit, written consent.</p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "4. Data Storage and Location",
    body: (
      <>
        <p>All data is stored in ISO 27001-certified data centres. Default storage region is the EU (Ireland). Enterprise customers may request dedicated regional storage (North America, Asia-Pacific) as part of their contract.</p>
        <p>Data is encrypted at rest using AES-256 and in transit using TLS 1.3. Encryption keys are managed by G-AID using a hardware security module (HSM); customer-managed keys are available on request for Enterprise plans.</p>
      </>
    ),
  },
  {
    id: "retention",
    heading: "5. Retention and Deletion",
    body: (
      <>
        <p>Project data is retained for the duration of your subscription plus a 90-day grace period. After account deletion, all data is purged from primary storage within 30 days and from backups within 90 days.</p>
        <p>You may delete individual files or entire projects at any time from within the platform. Deletion is immediate from primary storage; propagation to backups follows the 90-day schedule above.</p>
      </>
    ),
  },
  {
    id: "sharing",
    heading: "6. Data Sharing and Access",
    body: (
      <>
        <p>Your data is not shared with third parties except as outlined in our Privacy Policy (e.g., cloud infrastructure providers under data processing agreements).</p>
        <p>G-AID engineers may access your data only when:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>You have explicitly requested technical support and provided consent</li>
          <li>Required by law or court order</li>
          <li>Necessary to investigate a security incident affecting your account</li>
        </ul>
        <p className="mt-3">All internal access events are logged and auditable on Enterprise plans.</p>
      </>
    ),
  },
  {
    id: "ai-training",
    heading: "7. AI Training Policy",
    body: (
      <>
        <p>We do <strong>not</strong> use your proprietary geophysical datasets or AI interaction logs to train or fine-tune our models without explicit opt-in consent. By default, all user data is excluded from model training pipelines.</p>
        <p>Anonymised, aggregated usage statistics (e.g., workflow patterns, feature adoption rates) may be used to improve platform reliability and user experience. This data cannot be linked back to individual users or datasets.</p>
      </>
    ),
  },
  {
    id: "export",
    heading: "8. Data Portability and Export",
    body: (
      <p>You may export your project data, workflow configurations, and AI-generated reports at any time in industry-standard formats (JSON, CSV, GeoTIFF, SEG-Y). Export tools are available in the Project Settings panel. We will facilitate data export within 5 business days of a written request.</p>
    ),
  },
  {
    id: "contact",
    heading: "9. Questions",
    body: (
      <p>For questions about how your data is used, contact <span className="font-mono">data@g-aid.io</span>.</p>
    ),
  },
];

export default function DataUsePage() {
  return (
    <LegalLayout
      title="Data Use"
      subtitle="How G-AID handles, processes, and stores the scientific data you bring to the platform."
      lastUpdated="May 25, 2026"
      sections={SECTIONS}
    />
  );
}
