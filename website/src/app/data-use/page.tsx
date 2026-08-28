import { LegalLayout } from "@/components/landing/legal-layout";

export const metadata = {
  title: "Data Use — G-AID",
  description: "How G-AID handles scientific files on the local desktop workspace.",
};

const SECTIONS = [
  {
    id: "purpose",
    heading: "1. Purpose of This Document",
    body: (
      <p>
        This page covers geophysical files you open in the G-AID desktop app. It supplements the
        Privacy Policy. It does not describe a hosted object-store product.
      </p>
    ),
  },
  {
    id: "ownership",
    heading: "2. Data Ownership",
    body: (
      <p>
        You keep ownership of survey files on your disks. Outputs the desktop app writes into your
        project folder also belong to you.
      </p>
    ),
  },
  {
    id: "processing",
    heading: "3. How Data Is Processed",
    body: (
      <>
        <p>On your machine the app may:</p>
        <ul className="list-disc list-inside space-y-2 mt-2">
          <li>Read supported files from a folder you open</li>
          <li>Run local pack nodes (magnetics, gravity near-zone, ERT ingest, and the other Shipment 13 packs)</li>
          <li>Write QC and map artifacts next to that project</li>
          <li>Optionally send prompts to a local Ollama instance if you run one</li>
        </ul>
        <p className="mt-3">
          This website does not run hosted inversions or train models on your survey files.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "4. Storage",
    body: (
      <p>
        Default storage is local disk. There is no regional cloud tenancy, dedicated EU object
        store, or customer-managed key feature on this site.
      </p>
    ),
  },
  {
    id: "retention",
    heading: "5. Retention and Deletion",
    body: (
      <p>
        Delete files in your own folders to remove them. There is no subscription grace period
        because there is no subscription product here.
      </p>
    ),
  },
  {
    id: "sharing",
    heading: "6. Sharing",
    body: (
      <p>
        The desktop app does not publish your survey to other users. Collaborative cloud sessions
        are not offered.
      </p>
    ),
  },
  {
    id: "ai-training",
    heading: "7. Model training",
    body: (
      <p>
        G-AID does not take your local survey files to train hosted models. Optional Ollama models
        run on hardware you control.
      </p>
    ),
  },
  {
    id: "export",
    heading: "8. Export",
    body: (
      <p>
        Copy or archive the project folder on disk. There is no guaranteed SEG-Y or GeoTIFF export
        product from this website.
      </p>
    ),
  },
  {
    id: "contact",
    heading: "9. Questions",
    body: (
      <p>
        Data-use questions: <span className="font-mono">data@g-aid.io</span>.
      </p>
    ),
  },
];

export default function DataUsePage() {
  return (
    <LegalLayout
      title="Data Use"
      subtitle="Survey files stay on your machine unless you copy them yourself."
      lastUpdated="August 28, 2026"
      sections={SECTIONS}
    />
  );
}
