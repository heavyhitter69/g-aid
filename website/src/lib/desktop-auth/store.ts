export type DesktopAuthCodeRecord = {
  codeHash: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  stateHash: string;
  nonceHash: string;
  redirectUri: string;
  userId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: number;
  usedAt: number | null;
  createdAt: number;
};

export type ConsumeResult =
  | { status: "ok"; record: DesktopAuthCodeRecord }
  | { status: "missing" }
  | { status: "expired"; record?: DesktopAuthCodeRecord }
  | { status: "already_used" };

export interface DesktopAuthStore {
  insert(record: DesktopAuthCodeRecord): Promise<void>;
  get(codeHash: string): Promise<DesktopAuthCodeRecord | null>;
  consume(codeHash: string, now: number): Promise<ConsumeResult>;
}

export class MemoryDesktopAuthStore implements DesktopAuthStore {
  private readonly rows = new Map<string, DesktopAuthCodeRecord>();

  async insert(record: DesktopAuthCodeRecord): Promise<void> {
    if (this.rows.has(record.codeHash)) {
      throw new Error("duplicate_code_hash");
    }
    this.rows.set(record.codeHash, { ...record });
  }

  async get(codeHash: string): Promise<DesktopAuthCodeRecord | null> {
    const record = this.rows.get(codeHash);
    return record ? { ...record } : null;
  }

  async consume(codeHash: string, now: number): Promise<ConsumeResult> {
    const record = this.rows.get(codeHash);
    if (!record) return { status: "missing" };
    if (record.usedAt != null) return { status: "already_used" };
    if (record.expiresAt <= now) return { status: "expired", record };
    const used: DesktopAuthCodeRecord = { ...record, usedAt: now };
    this.rows.set(codeHash, used);
    return { status: "ok", record: used };
  }

  peek(codeHash: string): DesktopAuthCodeRecord | undefined {
    const record = this.rows.get(codeHash);
    return record ? { ...record } : undefined;
  }
}

const memorySingleton = new MemoryDesktopAuthStore();

export function getMemoryDesktopAuthStore(): MemoryDesktopAuthStore {
  return memorySingleton;
}
