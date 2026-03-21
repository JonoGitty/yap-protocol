import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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

  constructor(private storePath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf-8");
      this.data = JSON.parse(raw);
    } catch {
      this.data = null;
    }
  }

  async save(): Promise<void> {
    if (!this.data) return;
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(this.data, null, 2), "utf-8");
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

  listPeers(): string[] {
    return Object.keys(this.data?.peers ?? {});
  }
}
