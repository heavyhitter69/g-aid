import { USER_CAPABILITY_IDS, type UserCapabilityId } from "./types.ts";
import { isRegisteredCapability } from "./registry.ts";

const STEP_TO_CAPABILITY: Record<string, UserCapabilityId> = {
  diurnal: "mag.diurnal",
  igrf: "mag.igrf",
  headingLag: "mag.headingLag",
  level: "mag.level",
  grid: "mag.grid",
  rtp: "mag.rtp",
  derivatives: "mag.derivatives",
  lineaments: "mag.lineaments",
  gis: "mag.gis",
};

export const GRAVITY_DEFAULT: UserCapabilityId[] = [
  "grav.ingest",
  "grav.freeair",
  "grav.bouguer",
  "grav.grid",
  "grav.gis",
  "grav.interpret",
];

const ERT_DEFAULT: UserCapabilityId[] = ["ert.ingest", "ert.pseudosection", "ert.interpret"];
const ERT_INVERT_EXPERIMENTAL: UserCapabilityId = "ert.invert2d";

export const RADIO_DEFAULT: UserCapabilityId[] = [
  "rad.ingest",
  "rad.grid",
  "rad.ternary",
  "rad.ratios",
  "rad.gis",
  "rad.interpret",
];

export const GPR_DEFAULT: UserCapabilityId[] = ["gpr.ingest", "gpr.process", "gpr.interpret"];

export const BOREHOLE_DEFAULT: UserCapabilityId[] = [
  "borehole.ingest_las",
  "borehole.view_logs",
  "borehole.interpret",
];

export const GIS_DEFAULT: UserCapabilityId[] = [
  "gis.vector_ingest",
  "gis.vector_view",
  "gis.interpret",
];

export const GEOCHEM_DEFAULT: UserCapabilityId[] = [
  "geochem.ingest",
  "geochem.qc",
  "geochem.map_points",
  "geochem.summary",
  "geochem.interpret",
];

export function capabilityFromStepKey(key: string): UserCapabilityId | undefined {
  return STEP_TO_CAPABILITY[key];
}

export function stepKeyFromCapability(id: UserCapabilityId): string {
  if (id === "grav.residual") return "residual";
  if (id === "grav.terrain_near_zone") return "nearZoneTerrain";
  if (id === "grav.terrain_intermediate_zone") return "intermediateZoneTerrain";
  if (id === "grav.terrain_far_zone") return "farZoneTerrain";
  if (id.startsWith("grav.")) return "gravity";
  if (id === "ert.invert2d") return "ertInvert";
  if (id.startsWith("ert.")) return "ert";
  if (id.startsWith("rad.")) return "radiometrics";
  if (id.startsWith("gpr.")) return "gpr";
  if (id.startsWith("borehole.")) return "borehole";
  if (id.startsWith("gis.")) return "gisVector";
  if (id.startsWith("geochem.")) return "geochem";
  const found = Object.entries(STEP_TO_CAPABILITY).find(([, value]) => value === id);
  return found?.[0] || id;
}

export function capabilitiesFromSteps(steps: Record<string, boolean>): UserCapabilityId[] {
  const ids: UserCapabilityId[] = [];
  for (const [key, enabled] of Object.entries(steps)) {
    if (!enabled) continue;
    const id = STEP_TO_CAPABILITY[key];
    if (id) ids.push(id);
  }
  if (steps.gravity) {
    for (const id of GRAVITY_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.nearZoneTerrain) {
    for (const id of GRAVITY_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.includes("grav.terrain_near_zone")) ids.push("grav.terrain_near_zone");
  }
  if (steps.intermediateZoneTerrain) {
    for (const id of GRAVITY_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.includes("grav.terrain_near_zone")) ids.push("grav.terrain_near_zone");
    if (!ids.includes("grav.terrain_intermediate_zone")) ids.push("grav.terrain_intermediate_zone");
  }
  if (steps.farZoneTerrain) {
    for (const id of GRAVITY_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.includes("grav.terrain_near_zone")) ids.push("grav.terrain_near_zone");
    if (!ids.includes("grav.terrain_intermediate_zone")) ids.push("grav.terrain_intermediate_zone");
    if (!ids.includes("grav.terrain_far_zone")) ids.push("grav.terrain_far_zone");
  }
  if (steps.residual) {
    if (!ids.includes("grav.residual")) ids.push("grav.residual");
  }
  if (steps.ert) {
    for (const id of ERT_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.ertInvert) {
    for (const id of ERT_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
    if (!ids.includes(ERT_INVERT_EXPERIMENTAL)) ids.push(ERT_INVERT_EXPERIMENTAL);
  }
  if (steps.radiometrics) {
    for (const id of RADIO_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.gpr) {
    for (const id of GPR_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.borehole) {
    for (const id of BOREHOLE_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.gisVector) {
    for (const id of GIS_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (steps.geochem) {
    for (const id of GEOCHEM_DEFAULT) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export function stepsFromCapabilities(ids: string[]): Record<string, boolean> {
  const steps: Record<string, boolean> = {};
  for (const key of Object.keys(STEP_TO_CAPABILITY)) steps[key] = false;
  steps.gravity = false;
  steps.residual = false;
  steps.nearZoneTerrain = false;
  steps.intermediateZoneTerrain = false;
  steps.farZoneTerrain = false;
  steps.ert = false;
  steps.ertInvert = false;
  steps.radiometrics = false;
  steps.gpr = false;
  steps.borehole = false;
  steps.gisVector = false;
  steps.geochem = false;
  for (const id of ids) {
    if (!isRegisteredCapability(id)) continue;
    if (id === "grav.residual") {
      steps.residual = true;
      continue;
    }
    if (id === "grav.terrain_near_zone") {
      steps.nearZoneTerrain = true;
      steps.gravity = true;
      continue;
    }
    if (id === "grav.terrain_intermediate_zone") {
      steps.intermediateZoneTerrain = true;
      steps.nearZoneTerrain = true;
      steps.gravity = true;
      continue;
    }
    if (id === "grav.terrain_far_zone") {
      steps.farZoneTerrain = true;
      steps.intermediateZoneTerrain = true;
      steps.nearZoneTerrain = true;
      steps.gravity = true;
      continue;
    }
    if (id.startsWith("grav.")) {
      steps.gravity = true;
      continue;
    }
    if (id === "ert.invert2d") {
      steps.ertInvert = true;
      steps.ert = true;
      continue;
    }
    if (id.startsWith("ert.")) {
      steps.ert = true;
      continue;
    }
    if (id.startsWith("rad.")) {
      steps.radiometrics = true;
      continue;
    }
    if (id.startsWith("gpr.")) {
      steps.gpr = true;
      continue;
    }
    if (id.startsWith("borehole.")) {
      steps.borehole = true;
      continue;
    }
    if (id.startsWith("gis.")) {
      steps.gisVector = true;
      continue;
    }
    if (id.startsWith("geochem.")) {
      steps.geochem = true;
      continue;
    }
    steps[stepKeyFromCapability(id)] = true;
  }
  return steps;
}

/** Natural language may propose ids; the registry decides what exists. */
export function proposeCapabilitiesFromMessage(message: string, previous: UserCapabilityId[] = []): UserCapabilityId[] {
  const m = message.toLowerCase();
  const next = new Set(previous);
  const onlyDiurnal = /\b(only|just)\s+diurnal\b|\bdiurnal\s+only\b/.test(m);
  if (onlyDiurnal) {
    return ["mag.diurnal"];
  }

  const deny = (re: RegExp, id: UserCapabilityId) => {
    if (re.test(m)) next.delete(id);
  };
  const grant = (re: RegExp, id: UserCapabilityId) => {
    if (re.test(m) && isRegisteredCapability(id)) next.add(id);
  };

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(rtp|reduction to (the )?pole)\b/, "mag.rtp");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(rtp|reduction to (the )?pole)\b|\bdo rtp\b/, "mag.rtp");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(igrf|main field)\b/, "mag.igrf");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bigrf\b/, "mag.igrf");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(levell?ing|tie[ -]?lines?|microlevell?ing)\b/, "mag.level");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(levell?ing|tie[ -]?lines?)\b/, "mag.level");

  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(heading|lag)\b/, "mag.headingLag");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(grid(?:ding)?)\b/, "mag.grid");
  grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bgrid/, "mag.grid");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(derivative|magmap|analytic signal|lineament)\b/, "mag.derivatives");
  deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(diurnal)\b/, "mag.diurnal");

  if (/\brtp\b|reduction to (the )?pole/.test(m) && !/skip|omit|without|no rtp/.test(m)) {
    next.add("mag.rtp");
  }
  if (/\bdiurnal\b/.test(m) && !/skip|omit|without|no diurnal/.test(m)) next.add("mag.diurnal");
  if (/\bigrf\b/.test(m) && !/skip|omit|without/.test(m)) next.add("mag.igrf");

  const gravityAsk = /\b(gravity|bouguer|free[\s-]?air|mgal)\b/.test(m);
  const gravityDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(gravity|bouguer)\b/.test(m);
  if (gravityAsk && !gravityDeny) {
    for (const id of GRAVITY_DEFAULT) next.add(id);
    if (/\bregional\b|\bresidual\b/.test(m)) next.add("grav.residual");
  }
  if (/\bresidual gravity\b|\bregional[\s-].*residual/.test(m) && !gravityDeny) {
    next.add("grav.residual");
    for (const id of GRAVITY_DEFAULT) next.add(id);
  }
  const terrainAsk =
    /\bnear[\s-]?zone\s+terrain[\s-]?correct|\bterrain[\s-]?correct(?:ed|ion)?\s+bouguer|\bterrain\s+correct/.test(m) &&
    !/\b(skip|omit|without|no)\b.{0,40}\b(terrain|near[\s-]?zone)\b/.test(m);
  const completeAsk =
    /\bcomplete\s+bouguer\b/.test(m) &&
    !/\b(skip|omit|without|no)\b.{0,40}\b(terrain|complete bouguer)\b/.test(m);
  const zonedAsk = /\bzoned planar terrain-corrected bouguer(?: anomaly)?\b/.test(m);
  const intermediateAsk =
    /\bintermediate[\s-]?zone\s+terrain|\bhayford|\bbowie|\b166\.?7\s*km|\b167\s*km/.test(m) &&
    !/\b(skip|omit|without|no)\b.{0,40}\b(intermediate|hayford|bowie)\b/.test(m);
  const farAsk =
    /\bfar[\s-]?zone\s+terrain/.test(m) &&
    !/\b(skip|omit|without|no)\b.{0,40}\bfar[\s-]?zone\b/.test(m);
  // Complete Bouguer never auto-grants terrain. The named zoned planar alternative must be approved.
  if (zonedAsk || ((terrainAsk || intermediateAsk || farAsk) && !completeAsk)) {
    for (const id of GRAVITY_DEFAULT) next.add(id);
    next.add("grav.terrain_near_zone");
  }
  if (zonedAsk || ((intermediateAsk || farAsk) && !completeAsk)) {
    next.add("grav.terrain_intermediate_zone");
  }
  if (zonedAsk || (farAsk && !completeAsk)) {
    next.add("grav.terrain_far_zone");
  }

  const ertDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(ert|resistivity)\b/.test(m);
  const ertAsk = /\b(ert|resistivity|pseudosection|wenner|schlumberger|dipole[\s-]?dipole)\b/.test(m);
  const ertInvertAsk =
    /\b(ert|resistivity)\b.{0,40}\binvert|\binvert(?:ing|ed)?\s+(?:the\s+)?(?:ert|resistivity)|\b2[\s-]?d invert|\bexperimental invert/.test(
      m
    );
  if (ertAsk && !ertDeny) {
    for (const id of ERT_DEFAULT) next.add(id);
    if (ertInvertAsk && !/\bpseudosection only\b/.test(m)) next.add(ERT_INVERT_EXPERIMENTAL);
    if (/\bcatalog\b.{0,20}\bcrs\b|\bgeojson\b|\bmap the electrodes\b/.test(m)) next.add("ert.gis");
  }

  const radioDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(radiometr|spectrometer)/.test(m);
  const radioAsk =
    /\b(radiometr|spectrometer|airborne gamma)/.test(m) ||
    (/\bternary\b/.test(m) && /\b(radiometr|gamma|e[u]|eth)\b/.test(m));
  if (radioAsk && !radioDeny) {
    for (const id of RADIO_DEFAULT) next.add(id);
  }

  const gprDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(gpr|ground[\s-]?penetrating)/.test(m);
  const gprAsk = /\b(gpr|ground[\s-]?penetrating|radargram)\b/.test(m);
  if (gprAsk && !gprDeny) {
    for (const id of GPR_DEFAULT) next.add(id);
    if (/\bmigrat/.test(m) && !/\b(skip|omit|without|no)\b.{0,24}\bmigrat/.test(m)) next.add("gpr.migrate");
    if (/\b(geojson|gis|map the traces|trace positions)\b/.test(m)) next.add("gpr.gis");
  }

  const boreholeDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(borehole|well[\s-]?log|las)\b/.test(m);
  const lidar = /\b(lidar|point[\s-]?cloud|\blaz\b)\b/.test(m);
  const boreholeAsk =
    /\b(borehole|well[\s-]?log|cwls)\b/.test(m) ||
    (/\blas\b/.test(m) && !lidar);
  if (boreholeAsk && !boreholeDeny) {
    for (const id of BOREHOLE_DEFAULT) next.add(id);
    if (/\b(geojson|gis|map|collar|location)\b/.test(m)) next.add("borehole.map_collar");
  }

  const otherSurvey =
    gravityAsk ||
    ertAsk ||
    radioAsk ||
    gprAsk ||
    boreholeAsk ||
    /\b(magarrow|tmi|igrf|airborne mag|gsm-?19|diurnal|reduction to (the )?pole)\b/.test(m);
  const gisDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(geojson|vector overlay|gis vector)\b/.test(
    m
  );
  const gisAsk =
    !otherSurvey &&
    (/\bgeojson\b/.test(m) ||
      /\bshapefile\b/.test(m) ||
      /\bgeopackage\b|\.gpkg\b/.test(m) ||
      /\bvector (layer|overlay|ingest)\b/.test(m) ||
      /\bspatial overlap\b/.test(m) ||
      /\bgeology layer\b|\btenure layer\b|\bfault layer\b/.test(m));
  if (gisAsk && !gisDeny) {
    for (const id of GIS_DEFAULT) next.add(id);
    if (/\b(overlap|intersect|spatial query|overlay query)\b/.test(m)) next.add("gis.spatial_overlap");
    if (/\bexport\b/.test(m)) next.add("gis.export_vector");
  }

  const geochemDeny = /\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(geochem|assays?|soil samples?)\b/.test(m);
  const geochemAsk =
    /\b(geochem|geochemical|assays?|soil samples?|stream[\s-]?sediments?|rock[\s-]?chips?|rock samples?)\b/.test(m) &&
    !/\bradiometr|\bspectrometer\b|\bairborne gamma\b|\bgeojson\b|\bshapefile\b/.test(m);
  if (geochemAsk && !geochemDeny) {
    for (const id of GEOCHEM_DEFAULT) next.add(id);
    if (/\b(log10|log transform|display transform)\b/.test(m) && !/\b(skip|omit|without|no)\b.{0,24}\b(log|transform)/.test(m)) {
      next.add("geochem.display_transform");
    }
  }

  return USER_CAPABILITY_IDS.filter((id) => next.has(id));
}

export function unregisteredProposal(message: string): string | undefined {
  const m = message.toLowerCase();
  if (
    /\b(anomal(?:y|ies)|prospectiv(?:ity)?|mineral targets?|drill targets?|resource estimat\w*|machine[\s-]?learning|ml classif)\b/.test(
      m
    ) &&
    /\b(geochem|assays?|soil samples?|stream[\s-]?sediments?)\b/.test(m)
  ) {
    return "geochem.anomaly";
  }
  if (/\b(seismic|segy|nmo)\b/.test(m)) return "seismic";
  if (/\b(litholog(?:y|ies)?|aquifer|minerali[sz]ations?|minerali[sz]e|drill[\s-]?targets?|resource estimat\w*|well correlation|pay zone|reservoir)\b/.test(m) && !/\b(overlay|geojson|vector|gis)\b/.test(m)) {
    return "borehole.classify";
  }
  if (/\b(deviation survey|well path|directional (well|survey)|true vertical depth|\btvd\b|3d trajectory)\b/.test(m)) {
    return "borehole-trajectory";
  }
  if (
    /\b(prospectiv(?:ity)?|mineral targets?|resource\/reserve|reserve claims?|drill recommendations?)\b/.test(m) &&
    /\b(overlay|geojson|vector|gis|geology|tenure)\b/.test(m)
  ) {
    return "gis.prospectivity";
  }
  if (
    (/\b(buffer|clip|dissolve|geoprocess|attribute edit)\b/.test(m) && /\b(vector|geojson|shapefile|polygon|layer|gis)\b/.test(m)) ||
    (/\breproject\b/.test(m) && /\b(vector|geojson|shapefile|layer)\b/.test(m))
  ) {
    return "gis.geoprocess";
  }
  if (
    /\b(nasvd|stripp(?:ing|ed)|height[\s-]?correct|dead[\s-]?time|background[\s-]?correct|concentration conversion|window[\s-]?strip)\b/.test(
      m
    )
  ) {
    return "rad.correct";
  }
  if (/\bjoint inversion\b/.test(m)) return "joint-inversion";
  if (/\b3d\s+(ert|invers)/.test(m) || /\bert\s+3d\b/.test(m)) return "ert-3d";
  return undefined;
}
