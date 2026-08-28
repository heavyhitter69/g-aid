/**
 * geological-ontology.ts
 * 40+ geological entities with geophysical signatures and causal relationships.
 * Rules reference entity IDs — making inference machine-interpretable.
 * This is what makes the system inferential rather than procedural.
 */

import type { GeologicalEntity } from "@/types/scientific";

export const GEOLOGICAL_ONTOLOGY: GeologicalEntity[] = [
  // ─── Lithology ─────────────────────────────────────────────────────────────
  {
    id: "mafic_intrusion",
    name: "Mafic Intrusive Body",
    aliases: ["gabbro", "dolerite", "diabase", "mafic plug"],
    category: "lithology",
    description: "Dense, magnetic, often circular igneous intrusion of mafic composition.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "high", shapePrediction: "circular", amplitudeQualifier: "strong", notes: "High susceptibility; remanence may complicate RTP" },
      { modality: "gravity", expectedResponse: "high", shapePrediction: "circular", amplitudeQualifier: "moderate", notes: "Density ~2.9–3.1 g/cm³ vs typical host rock" },
    ],
    relationships: [
      { targetEntityId: "contact_aureole", relationshipType: "may_cause", confidence: 0.8, notes: "Thermal metamorphism at contact" },
      { targetEntityId: "hydrothermal_system", relationshipType: "may_cause", confidence: 0.6, notes: "Cooling intrusion drives hydrothermal circulation" },
      { targetEntityId: "mineralization_zone", relationshipType: "often_associated", confidence: 0.5, notes: "Contact-related mineralisation common" },
    ],
    depthRange: { minM: 0, maxM: 5000 },
    scaleRange: { minKm: 0.1, maxKm: 50 },
  },
  {
    id: "felsic_intrusion",
    name: "Felsic Intrusive Body",
    aliases: ["granite", "granodiorite", "rhyolite plug", "felsic batholith"],
    category: "lithology",
    description: "Low-density, weakly magnetic igneous body of felsic composition.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "weak", notes: "Low susceptibility; often creates magnetic low" },
      { modality: "gravity", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "moderate", notes: "Density ~2.6 g/cm³ — creates Bouguer low" },
    ],
    relationships: [
      { targetEntityId: "hydrothermal_system", relationshipType: "may_cause", confidence: 0.7, notes: "Late-stage fluid circulation" },
      { targetEntityId: "gold_mineralisation", relationshipType: "often_associated", confidence: 0.55, notes: "Epithermal/mesothermal systems" },
    ],
    depthRange: { minM: 0, maxM: 10000 },
    scaleRange: { minKm: 1, maxKm: 200 },
  },
  {
    id: "dyke",
    name: "Igneous Dyke",
    aliases: ["dike", "mafic dyke", "felsic dyke"],
    category: "lithology",
    description: "Tabular igneous intrusion, typically linear in plan view.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "high", shapePrediction: "linear", amplitudeQualifier: "strong", notes: "Linear magnetic lineament; width-dependent anomaly" },
      { modality: "gravity", expectedResponse: "contrast", shapePrediction: "linear", amplitudeQualifier: "weak", notes: "Density contrast depends on composition vs host" },
    ],
    relationships: [
      { targetEntityId: "fault", relationshipType: "often_associated", confidence: 0.7, notes: "Dykes commonly exploit fault zones" },
      { targetEntityId: "shear_zone", relationshipType: "often_associated", confidence: 0.6, notes: "Structural controls on emplacement" },
    ],
    depthRange: { minM: 0, maxM: 5000 },
    scaleRange: { minKm: 0.01, maxKm: 100 },
  },
  {
    id: "sedimentary_basin",
    name: "Sedimentary Basin",
    aliases: ["basin", "graben", "trough", "depocenter"],
    category: "lithology",
    description: "Thick accumulation of sedimentary rocks, typically low density and low susceptibility.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "weak", notes: "Diamagnetic to weakly paramagnetic sediments" },
      { modality: "gravity", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Large Bouguer low over thick sediment pile" },
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "layered", amplitudeQualifier: "strong", notes: "Clear reflectors within sedimentary sequence" },
    ],
    relationships: [
      { targetEntityId: "fault", relationshipType: "often_associated", confidence: 0.85, notes: "Fault-bounded basins common" },
      { targetEntityId: "palaeochannel", relationshipType: "often_associated", confidence: 0.6, notes: "Channels within basin fill" },
      { targetEntityId: "groundwater_aquifer", relationshipType: "may_cause", confidence: 0.7, notes: "Permeable basin sediments host aquifers" },
    ],
    depthRange: { minM: 0, maxM: 15000 },
    scaleRange: { minKm: 1, maxKm: 500 },
  },
  {
    id: "crystalline_basement",
    name: "Crystalline Basement",
    aliases: ["basement", "bedrock", "metamorphic basement", "Precambrian basement"],
    category: "lithology",
    description: "High-density, variably magnetic basement complex underlying sedimentary cover.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "variable", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Highly variable — depends on composition and metamorphic grade" },
      { modality: "gravity", expectedResponse: "high", shapePrediction: "irregular", amplitudeQualifier: "moderate", notes: "Higher density than sedimentary cover" },
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Strong reflection at basement surface" },
    ],
    relationships: [
      { targetEntityId: "sedimentary_basin", relationshipType: "often_associated", confidence: 0.9, notes: "Basin sits above basement" },
    ],
    depthRange: { minM: 50, maxM: 50000 },
    scaleRange: { minKm: 1, maxKm: 1000 },
  },
  {
    id: "weathered_layer",
    name: "Weathered Regolith",
    aliases: ["saprolite", "laterite", "weathered zone", "regolith"],
    category: "lithology",
    description: "Chemically weathered surface layer. Highly conductive when clay-rich or saturated.",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "low", shapePrediction: "layered", amplitudeQualifier: "moderate", notes: "Clay-rich regolith: 10–100 Ohm.m" },
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "layered", amplitudeQualifier: "weak", notes: "Magnetite destruction during weathering reduces response" },
    ],
    relationships: [
      { targetEntityId: "groundwater_aquifer", relationshipType: "often_associated", confidence: 0.65, notes: "Perched water tables common in regolith" },
    ],
    depthRange: { minM: 0, maxM: 200 },
    scaleRange: { minKm: 0.01, maxKm: 500 },
  },

  // ─── Structures ────────────────────────────────────────────────────────────
  {
    id: "fault",
    name: "Fault Zone",
    aliases: ["normal fault", "reverse fault", "strike-slip", "thrust fault"],
    category: "structure",
    description: "Planar or curviplanar discontinuity with displacement. May localise fluids, mineralisation, and secondary porosity.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "contrast", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Gradient lineaments; offsets in anomaly pattern" },
      { modality: "gravity", expectedResponse: "contrast", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Juxtaposition of different density units" },
      { modality: "resistivity", expectedResponse: "variable", shapePrediction: "linear", amplitudeQualifier: "variable", notes: "Fault core may be conductive (gouge/water) or resistive (silicification)" },
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "linear", amplitudeQualifier: "strong", notes: "Reflector terminations, diffractions" },
    ],
    relationships: [
      { targetEntityId: "shear_zone", relationshipType: "often_associated", confidence: 0.8, notes: "Ductile shear at depth grades into brittle fault" },
      { targetEntityId: "mineralization_zone", relationshipType: "may_cause", confidence: 0.65, notes: "Structural controls on ore deposition" },
      { targetEntityId: "groundwater_aquifer", relationshipType: "may_cause", confidence: 0.55, notes: "Fault conduits or barriers to flow" },
    ],
    depthRange: { minM: 0, maxM: 30000 },
    scaleRange: { minKm: 0.01, maxKm: 1000 },
  },
  {
    id: "shear_zone",
    name: "Shear Zone",
    aliases: ["mylonite zone", "ductile shear", "crustal shear"],
    category: "structure",
    description: "Ductile deformation zone. Strongly anisotropic. Often associated with gold-bearing quartz veins.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Magnetite destruction in shear zone; linear magnetic low" },
      { modality: "resistivity", expectedResponse: "low", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Graphitic or sulphide-bearing shear fabric" },
    ],
    relationships: [
      { targetEntityId: "gold_mineralisation", relationshipType: "often_associated", confidence: 0.75, notes: "Shear-hosted lode gold" },
      { targetEntityId: "fault", relationshipType: "often_associated", confidence: 0.8, notes: "Brittle-ductile transition" },
    ],
    depthRange: { minM: 500, maxM: 20000 },
    scaleRange: { minKm: 0.1, maxKm: 500 },
  },
  {
    id: "fold_axis",
    name: "Fold Axis / Anticline",
    aliases: ["anticline", "syncline", "fold hinge", "structural high"],
    category: "structure",
    description: "Curvilinear hinge of a fold structure. May trap hydrocarbons or focus groundwater.",
    geophysicalSignatures: [
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Curved reflectors converging at hinge" },
      { modality: "gravity", expectedResponse: "variable", shapePrediction: "elongated", amplitudeQualifier: "weak", notes: "Density variation across fold limbs" },
    ],
    relationships: [
      { targetEntityId: "sedimentary_basin", relationshipType: "often_associated", confidence: 0.7, notes: "Folds within basin stratigraphy" },
    ],
    depthRange: { minM: 0, maxM: 20000 },
    scaleRange: { minKm: 0.1, maxKm: 500 },
  },

  // ─── Fluid Systems ─────────────────────────────────────────────────────────
  {
    id: "groundwater_aquifer",
    name: "Groundwater Aquifer",
    aliases: ["aquifer", "water table", "saturated zone", "groundwater body"],
    category: "fluid",
    description: "Permeable geological unit saturated with groundwater.",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "low", shapePrediction: "layered", amplitudeQualifier: "strong", notes: "Saturated zone: 5–50 Ohm.m; freshwater higher than saline" },
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "layered", amplitudeQualifier: "moderate", notes: "Seismic velocity change at water table" },
    ],
    relationships: [
      { targetEntityId: "fault", relationshipType: "often_associated", confidence: 0.55, notes: "Fault conduits or barriers" },
      { targetEntityId: "palaeochannel", relationshipType: "often_associated", confidence: 0.75, notes: "Palaeochannels as high-permeability pathways" },
    ],
    depthRange: { minM: 0, maxM: 500 },
    scaleRange: { minKm: 0.1, maxKm: 200 },
  },
  {
    id: "palaeochannel",
    name: "Palaeochannel",
    aliases: ["buried valley", "fossil channel", "ancient drainage"],
    category: "fluid",
    description: "Buried ancient drainage channel, typically sand/gravel-filled. High hydraulic conductivity.",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "high", shapePrediction: "elongated", amplitudeQualifier: "moderate", notes: "Dry gravel: 500–2000 Ohm.m; saturated: lower" },
      { modality: "gravity", expectedResponse: "low", shapePrediction: "elongated", amplitudeQualifier: "weak", notes: "Low-density fill vs surrounding material" },
      { modality: "seismic", expectedResponse: "contrast", shapePrediction: "elongated", amplitudeQualifier: "moderate", notes: "Incised valley fill reflectors" },
    ],
    relationships: [
      { targetEntityId: "groundwater_aquifer", relationshipType: "often_associated", confidence: 0.8, notes: "Palaeochannels as primary aquifer targets" },
    ],
    depthRange: { minM: 0, maxM: 300 },
    scaleRange: { minKm: 0.1, maxKm: 100 },
  },
  {
    id: "hydrothermal_system",
    name: "Hydrothermal System",
    aliases: ["hydrothermal plume", "epithermal system", "hydrothermal alteration zone"],
    category: "fluid",
    description: "Hot fluid circulation system driven by heat source (intrusion or deep circulation).",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "variable", shapePrediction: "irregular", amplitudeQualifier: "variable", notes: "Argillic alteration: conductive; silicic: resistive" },
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "moderate", notes: "Magnetite destruction in alteration envelope" },
    ],
    relationships: [
      { targetEntityId: "mafic_intrusion", relationshipType: "often_associated", confidence: 0.7, notes: "Heat source for circulation" },
      { targetEntityId: "mineralization_zone", relationshipType: "may_cause", confidence: 0.8, notes: "Hydrothermal transport and deposition" },
    ],
    depthRange: { minM: 0, maxM: 5000 },
    scaleRange: { minKm: 0.1, maxKm: 50 },
  },

  // ─── Economic / Processes ──────────────────────────────────────────────────
  {
    id: "mineralization_zone",
    name: "Mineralisation Zone",
    aliases: ["ore zone", "economic mineralisation", "metal deposit"],
    category: "economic",
    description: "Zone of economic metal concentration. Geophysical expression depends on mineralogy.",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Sulphide-bearing zones: conductive; oxidised: resistive" },
      { modality: "magnetic", expectedResponse: "variable", shapePrediction: "irregular", amplitudeQualifier: "variable", notes: "Magnetite-bearing: high; pyrite dominant: low" },
    ],
    relationships: [
      { targetEntityId: "hydrothermal_system", relationshipType: "often_associated", confidence: 0.8, notes: "Hydrothermal transport" },
      { targetEntityId: "shear_zone", relationshipType: "often_associated", confidence: 0.7, notes: "Structural trap" },
    ],
    depthRange: { minM: 0, maxM: 3000 },
    scaleRange: { minKm: 0.01, maxKm: 10 },
  },
  {
    id: "gold_mineralisation",
    name: "Gold Mineralisation",
    aliases: ["lode gold", "orogenic gold", "epithermal gold"],
    category: "economic",
    description: "Gold-bearing system, typically associated with quartz veins in shear zones.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Demagnetisation along shear — linear magnetic low" },
      { modality: "resistivity", expectedResponse: "high", shapePrediction: "linear", amplitudeQualifier: "moderate", notes: "Silicified, quartz-veined: resistive" },
    ],
    relationships: [
      { targetEntityId: "shear_zone", relationshipType: "often_associated", confidence: 0.8, notes: "Structurally controlled" },
      { targetEntityId: "hydrothermal_system", relationshipType: "often_associated", confidence: 0.75, notes: "Fluid-deposited" },
    ],
    depthRange: { minM: 0, maxM: 3000 },
    scaleRange: { minKm: 0.01, maxKm: 5 },
  },
  {
    id: "contact_aureole",
    name: "Contact Metamorphic Aureole",
    aliases: ["contact metamorphism", "hornfels", "skarn"],
    category: "process",
    description: "Thermally metamorphosed rock surrounding an intrusion.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "high", shapePrediction: "irregular", amplitudeQualifier: "moderate", notes: "Magnetite generation during contact metamorphism" },
    ],
    relationships: [
      { targetEntityId: "mafic_intrusion", relationshipType: "often_associated", confidence: 0.9, notes: "Caused by intrusion heat" },
    ],
    depthRange: { minM: 0, maxM: 3000 },
    scaleRange: { minKm: 0.01, maxKm: 5 },
  },
  {
    id: "alteration_halo",
    name: "Alteration Halo",
    aliases: ["propylitic zone", "argillic alteration", "phyllic zone"],
    category: "process",
    description: "Zone of chemical alteration around hydrothermal system or intrusion.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "moderate", notes: "Magnetite destruction in alteration" },
      { modality: "resistivity", expectedResponse: "variable", shapePrediction: "irregular", amplitudeQualifier: "variable", notes: "Clay minerals: conductive; silicified core: resistive" },
    ],
    relationships: [
      { targetEntityId: "mineralization_zone", relationshipType: "may_cause", confidence: 0.65, notes: "Alteration is proximal to mineralisation" },
    ],
    depthRange: { minM: 0, maxM: 2000 },
    scaleRange: { minKm: 0.01, maxKm: 20 },
  },
  {
    id: "conductive_zone",
    name: "Conductive Zone",
    aliases: ["low resistivity zone", "conductor", "em conductor"],
    category: "anomaly",
    description: "Generic low-resistivity body — may represent graphite, sulphide, saline water, or clay.",
    geophysicalSignatures: [
      { modality: "resistivity", expectedResponse: "low", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "<10 Ohm.m — strong conductor" },
    ],
    relationships: [
      { targetEntityId: "mineralization_zone", relationshipType: "may_cause", confidence: 0.4, notes: "May be sulphide-related" },
      { targetEntityId: "groundwater_aquifer", relationshipType: "may_cause", confidence: 0.6, notes: "Saline groundwater" },
      { targetEntityId: "weathered_layer", relationshipType: "often_associated", confidence: 0.7, notes: "Clay-rich regolith" },
    ],
    depthRange: null,
    scaleRange: null,
  },
  {
    id: "magnetic_high",
    name: "Magnetic High Anomaly",
    aliases: ["positive magnetic anomaly", "mag high"],
    category: "anomaly",
    description: "Positive magnetic anomaly — source has elevated magnetic susceptibility or remanence.",
    geophysicalSignatures: [
      { modality: "magnetic", expectedResponse: "high", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Could be intrusion, BIF, magnetite skarn, or cultural" },
    ],
    relationships: [
      { targetEntityId: "mafic_intrusion", relationshipType: "often_associated", confidence: 0.7, notes: "Most common cause" },
      { targetEntityId: "contact_aureole", relationshipType: "often_associated", confidence: 0.5, notes: "Magnetite from contact metamorphism" },
    ],
    depthRange: null,
    scaleRange: null,
  },
  {
    id: "gravity_high",
    name: "Gravity High Anomaly",
    aliases: ["Bouguer high", "positive gravity anomaly"],
    category: "anomaly",
    description: "Positive Bouguer anomaly indicating excess mass — dense rock or thin crust.",
    geophysicalSignatures: [
      { modality: "gravity", expectedResponse: "high", shapePrediction: "irregular", amplitudeQualifier: "strong", notes: "Mafic rocks, greenstone belts, basement highs" },
    ],
    relationships: [
      { targetEntityId: "mafic_intrusion", relationshipType: "often_associated", confidence: 0.65, notes: "Dense mafic rocks" },
      { targetEntityId: "crystalline_basement", relationshipType: "often_associated", confidence: 0.55, notes: "Basement high" },
    ],
    depthRange: null,
    scaleRange: null,
  },
];

export function getEntityById(id: string): GeologicalEntity | undefined {
  return GEOLOGICAL_ONTOLOGY.find((e) => e.id === id);
}

export function getEntitiesByCategory(category: GeologicalEntity["category"]): GeologicalEntity[] {
  return GEOLOGICAL_ONTOLOGY.filter((e) => e.category === category);
}

export function getEntitiesByModality(modality: string): GeologicalEntity[] {
  return GEOLOGICAL_ONTOLOGY.filter((e) =>
    e.geophysicalSignatures.some((s) => s.modality === modality)
  );
}

export function getRelatedEntities(entityId: string): GeologicalEntity[] {
  const entity = getEntityById(entityId);
  if (!entity) return [];
  return entity.relationships
    .map((r) => getEntityById(r.targetEntityId))
    .filter(Boolean) as GeologicalEntity[];
}
