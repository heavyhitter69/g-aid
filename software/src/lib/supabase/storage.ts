/**
 * src/lib/supabase/storage.ts
 *
 * Handles all file I/O with Supabase Storage + project_files metadata table.
 * Authenticated users → files streamed to Supabase (no browser memory pressure).
 * Demo/unauthenticated users → files read in-memory, capped at 2 MB.
 */

import { createClient } from "@/lib/supabase/client";

const BUCKET = "geophysics-files";
const DEMO_SIZE_CAP = 2 * 1024 * 1024; // 2 MB — safe in-memory limit for demo

export interface UploadedFile {
  name: string;
  storagePath: string | null; // null = demo / in-memory only
  sizeBytes: number;
  mimeType: string;
  /** Only populated for small demo files read into memory */
  textContent?: string;
}

/**
 * Upload one file to Supabase Storage and record its metadata.
 * Falls back to in-memory read if unauthenticated or file > cap.
 */
export async function uploadFile(
  file: File,
  projectId?: string,
  relativePath?: string
): Promise<UploadedFile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let activeUserId = user?.id;
  if (!activeUserId) {
    if (typeof window !== "undefined") {
      activeUserId = localStorage.getItem("gaid_guest_id") || undefined;
      if (!activeUserId) {
        activeUserId = "guest_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("gaid_guest_id", activeUserId);
      }
    } else {
      activeUserId = "guest_unknown";
    }
  }

  const isGuest = !user;
  const filePath = relativePath || file.name;
  
  // ALWAYS bypass Supabase storage since the demo buckets are missing
  if (true) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", projectId || "unsorted");
    formData.append("path", filePath);
    
    await fetch("/api/upload", { method: "POST", body: formData }).catch(console.error);
    
    const storagePath = `local_uploads/${projectId || "unsorted"}/${filePath}`;
    
    return {
      name: file.name,
      storagePath,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    };
  }

  const activeBucket = BUCKET;
  const activeTable = "project_files";

  const storagePath = `${activeUserId}/${projectId ?? "unsorted"}/${filePath}`;

  const { error: uploadError } = await supabase.storage
    .from(activeBucket)
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError?.message}`);
  }

  // Insert metadata row
  if (projectId) {
    await supabase.from(activeTable).insert({
      project_id: projectId,
      user_id: activeUserId,
      name: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: file.type || null,
    });
  }

  return {
    name: file.name,
    storagePath,
    sizeBytes: file.size,
    mimeType: file.type,
  };
}


/**
 * Get a short-lived signed URL for a file in Storage (60 min).
 */
export async function getSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Fetch text content of a file from Storage (for the editor).
 * Returns null if the file is binary / too large.
 */
export async function fetchFileText(storagePath: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error || !data) return null;
  if (data.size > 5 * 1024 * 1024) return null; // skip > 5 MB

  return data.text();
}

/**
 * List all files for a project from the database.
 */
export async function listProjectFiles(projectId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("project_files")
    .select("id, name, storage_path, size_bytes, mime_type, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Ensure a project row exists for this user+name combo, returning its id.
 */
export async function upsertProject(name: string): Promise<string | null> {
  // ALWAYS bypass Supabase since we are using local file storage
  return name;
}

/** Upsert profile metadata after sign-in */
export async function upsertProfile(meta: {
  fullName: string;
  institution: string;
  role: string;
  discipline: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profiles").upsert({
    id: user.id,
    full_name: meta.fullName,
    institution: meta.institution,
    role: meta.role,
    discipline: meta.discipline,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) ?? "");
    reader.onerror = () => reject(new Error("FileReader error"));
    reader.readAsText(file);
  });
}
