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
  projectId: string | null
): Promise<UploadedFile> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Authenticated upload ──────────────────────────────────────────────────
  if (user) {
    const storagePath = `${user.id}/${projectId ?? "unsorted"}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Insert metadata row
    if (projectId) {
      await supabase.from("project_files").insert({
        project_id: projectId,
        user_id: user.id,
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

  // ── Demo / unauthenticated: read into memory (capped at 2 MB) ─────────────
  if (file.size > DEMO_SIZE_CAP) {
    // File too large for in-memory demo — return metadata only, no content
    return {
      name: file.name,
      storagePath: null,
      sizeBytes: file.size,
      mimeType: file.type,
      textContent: `[File too large to preview in demo mode — ${(file.size / 1024 / 1024).toFixed(1)} MB. Sign in to upload large files.]`,
    };
  }

  const textContent = await readFileAsText(file);
  return {
    name: file.name,
    storagePath: null,
    sizeBytes: file.size,
    mimeType: file.type,
    textContent,
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Check if project already exists
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name })
    .select("id")
    .single();

  if (error) return null;
  return created.id;
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
