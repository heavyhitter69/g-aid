import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const project = formData.get('project') as string || 'default';
    const filePath = formData.get('path') as string || file.name;

    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Use .tmp/executions directly so route.ts doesn't even need to download it!
    // But route.ts uses sessionId. Let's just use .tmp/local_uploads for now.
    const destDir = path.join(process.cwd(), '.tmp', 'local_uploads', project, path.dirname(filePath));
    const destFile = path.join(process.cwd(), '.tmp', 'local_uploads', project, filePath);

    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(destFile, buffer);

    return Response.json({ success: true, path: destFile });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
