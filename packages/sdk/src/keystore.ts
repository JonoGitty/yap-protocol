import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import type { KeyPair } from "./crypto.js";

interface KeystoreData {
  own: {
    encryption: KeyPair;
    signing: KeyPair;
  };
  peers: Record<string, {
    encryption_public_key: string;
    signing_public_key: string;
    first_seen: string;
    last_seen: string;
  }>;
}

export class Keystore {
  private data: KeystoreData | null = null;

  constructor(private storePath: string, private passphrase?: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf-8");
      if (this.passphrase) {
        const parsed = JSON.parse(raw) as { encrypted: string; salt: string; iv: string; tag: string };
        const salt = Buffer.from(parsed.salt, "base64");
        const key = scryptSync(this.passphrase, salt, 32);
        const iv = Buffer.from(parsed.iv, "base64");
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(parsed.encrypted, "base64")),
          decipher.final(),
        ]);
        this.data = JSON.parse(decrypted.toString("utf-8"));
      } else {
        this.data = JSON.parse(raw);
      }
    } catch {
      this.data = null;
    }
  }

  async save(): Promise<void> {
    if (!this.data) return;
    await mkdir(dirname(this.storePath), { recursive: true });

    if (this.passphrase) {
      const salt = randomBytes(16);
      const key = scryptSync(this.passphrase, salt, 32);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(this.data), "utf-8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      await writeFile(this.storePath, JSON.stringify({
        encrypted: encrypted.toString("base64"),
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
      }), "utf-8");
    } else {
      await writeFile(this.storePath, JSON.stringify(this.data, null, 2), "utf-8");
    }
  }

  isInitialized(): boolean {
    return this.data !== null;
  }

  initialize(encryptionKeys: KeyPair, signingKeys: KeyPair): void {
    this.data = {
      own: { encryption: encryptionKeys, signing: signingKeys },
      peers: {},
    };
  }

  getOwnEncryptionKeys(): KeyPair | undefined {
    return this.data?.own.encryption;
  }

  getOwnSigningKeys(): KeyPair | undefined {
    return this.data?.own.signing;
  }

  storePeerKeys(agent: string, encryptionPublicKey: string, signingPublicKey: string): void {
    if (!this.data) return;
    this.data.peers[agent] = {
      encryption_public_key: encryptionPublicKey,
      signing_public_key: signingPublicKey,
      first_seen: this.data.peers[agent]?.first_seen ?? new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };
  }

  getPeerEncryptionKey(agent: string): string | undefined {
    return this.data?.peers[agent]?.encryption_public_key;
  }

  getPeerSigningKey(agent: string): string | undefined {
    return this.data?.peers[agent]?.signing_public_key;
  }

  hasPeerKeys(agent: string): boolean {
    return !!this.data?.peers[agent];
  }

  removePeer(agent: string): boolean {
    if (!this.data?.peers[agent]) return false;
    delete this.data.peers[agent];
    return true;
  }

  listPeers(): string[] {
    return Object.keys(this.data?.peers ?? {});
  }
}
