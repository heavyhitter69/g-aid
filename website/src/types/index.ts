export type UserRole = "student" | "researcher" | "consultant" | "exploration";

export type DisciplineId =
  | "exploration"
  | "environmental"
  | "seismology"
  | "hydrogeophysics"
  | "data-analysis"
  | "geotechnical"
  | "geomatics";

export interface Discipline {
  id: DisciplineId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  datasets: string[];
  workflows: string[];
}

export interface UserProfile {
  fullName: string;
  institution: string;
  email: string;
  role: UserRole;
  discipline: DisciplineId | null;
}
