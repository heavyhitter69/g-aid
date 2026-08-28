export interface ProjectFile {
  /** Unique path within the opened project, e.g. `surveys/line4.dat` */
  id: string;
  /** Basename for tabs and labels */
  name: string;
  type: "file" | "folder";
  path: string;
}
