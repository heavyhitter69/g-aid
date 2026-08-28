import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pkceS256Challenge, sha256Hex } from "./contract.ts";

export type DesktopAuthCrypto = {
  randomCode(): string;
  hash(value: string): string;
  pkceChallenge(verifier: string): string;
  encrypt(plain: string): string;
  decrypt(payload: string): string;
};

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

export function createDesktopAuthCrypto(secret: string): DesktopAuthCrypto {
  if (!secret) {
    throw new Error("DESKTOP_AUTH_TOKEN_KEY is required to encrypt desktop authorization codes");
  }
  const key = createHash("sha256").update(secret, "utf8").digest();

  return {
    randomCode() {
      return base64Url(randomBytes(32));
    },
    hash(value: string) {
      return sha256Hex(value);
    },
    pkceChallenge(verifier: string) {
      return pkceS256Challenge(verifier);
    },
    encrypt(plain: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1.${base64Url(iv)}.${base64Url(encrypted)}.${base64Url(tag)}`;
    },
    decrypt(payload: string) {
      const parts = payload.split(".");
      if (parts.length !== 4 || parts[0] !== "v1") {
        throw new Error("invalid_ciphertext");
      }
      const iv = Buffer.from(parts[1], "base64url");
      const encrypted = Buffer.from(parts[2], "base64url");
      const tag = Buffer.from(parts[3], "base64url");
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    },
  };
}

export function desktopAuthTokenKey(): string {
  return (process.env.DESKTOP_AUTH_TOKEN_KEY ?? "").trim();
}
