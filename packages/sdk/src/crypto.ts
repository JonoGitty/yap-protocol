import crypto from "node:crypto";
const { randomBytes, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, createPrivateKey, createPublicKey, diffieHellman, sign: cryptoSign, verify: cryptoVerify } = crypto;
import type { YapPacket } from "./types.js";

/**
 * Yap encryption using Node.js built-in crypto.
 * Uses X25519 for key exchange and AES-256-GCM for encryption.
 * Uses Ed25519 for signing (via Node.js crypto).
 *
 * Note: Phase 4 spec calls for XChaCha20-Poly1305. We use AES-256-GCM
 * as it's available natively in Node.js without external deps.
 * Can swap to @noble/ciphers later for XChaCha20.
 */

// --- Key generation ---

export interface KeyPair {
  publicKey: string; // base64
  secretKey: string; // base64
}

export function generateEncryptionKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("x25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicKey: Buffer.from(publicKey).toString("base64"),
    secretKey: Buffer.from(privateKey).toString("base64"),
  };
}

export function generateSigningKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });
  return {
    publicKey: Buffer.from(publicKey).toString("base64"),
    secretKey: Buffer.from(privateKey).toString("base64"),
  };
}

// --- Perfect forward secrecy: ephemeral keys per thread ---

export interface EphemeralSession {
  threadId: string;
  ephemeralKeyPair: KeyPair;
  sessionKey: Buffer | null; // Derived once peer ephemeral received
  peerEphemeralPublic: string | null;
}

const ephemeralSessions = new Map<string, EphemeralSession>();

/** Generate an ephemeral key pair for a thread. Provides PFS. */
export function createEphemeralSession(threadId: string): EphemeralSession {
  const ephemeralKeyPair = generateEncryptionKeyPair();
  const session: EphemeralSession = {
    threadId,
    ephemeralKeyPair,
    sessionKey: null,
    peerEphemeralPublic: null,
  };
  ephemeralSessions.set(threadId, session);
  return session;
}

/** Complete an ephemeral session with the peer's ephemeral public key. */
export function completeEphemeralSession(threadId: string, peerEphemeralPublic: string): Buffer {
  const session = ephemeralSessions.get(threadId);
  if (!session) throw new Error(`No ephemeral session for thread ${threadId}`);
  session.peerEphemeralPublic = peerEphemeralPublic;
  session.sessionKey = deriveSharedSecret(session.ephemeralKeyPair.secretKey, peerEphemeralPublic);
  return session.sessionKey;
}

/** Get the session key for a thread (for encrypt/decrypt). */
export function getSessionKey(threadId: string): Buffer | null {
  return ephemeralSessions.get(threadId)?.sessionKey ?? null;
}

/** Get the ephemeral public key for a thread (to send to peer). */
export function getEphemeralPublic(threadId: string): string | null {
  return ephemeralSessions.get(threadId)?.ephemeralKeyPair.publicKey ?? null;
}

/** Clean up a session when thread completes. */
export function destroyEphemeralSession(threadId: string): void {
  ephemeralSessions.delete(threadId);
}

// --- Shared secret derivation ---

export function deriveSharedSecret(mySecretKey: string, theirPublicKey: string): Buffer {
  const myKey = createPrivateKey({
    key: Buffer.from(mySecretKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const theirKey = createPublicKey({
    key: Buffer.from(theirPublicKey, "base64"),
    format: "der",
    type: "spki",
  });
  const shared = diffieHellman({ privateKey: myKey, publicKey: theirKey });
  // Hash the shared secret for use as AES key
  return createHash("sha256").update(shared).digest();
}

// --- Encryption (AES-256-GCM) ---

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
  tag: string; // base64
}

export function encrypt(plaintext: string, sharedSecret: Buffer): EncryptedPayload {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sharedSecret, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decrypt(payload: EncryptedPayload, sharedSecret: Buffer): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    sharedSecret,
    Buffer.from(payload.nonce, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

// --- Signing (Ed25519) ---

export function sign(data: string, secretKey: string): string {
  const key = createPrivateKey({
    key: Buffer.from(secretKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = cryptoSign(null, Buffer.from(data), key);
  return signature.toString("base64");
}

export function verify(data: string, signature: string, publicKey: string): boolean {
  const key = createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  return cryptoVerify(null, Buffer.from(data), key, Buffer.from(signature, "base64"));
}

// --- Packet encryption helpers ---

/** Extract the body fields from a packet that should be encrypted. */
function extractBody(packet: YapPacket): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const bodyFields = [
    "intent", "context", "needs", "permissions", "context_provided",
    "context_unavailable", "proposal", "status", "reason_class",
    "previous_intent", "fork_threads", "shared_context",
    "nest_id", "nest_fields", "nest_version",
  ];
  for (const field of bodyFields) {
    if ((packet as unknown as Record<string, unknown>)[field] !== undefined) {
      body[field] = (packet as unknown as Record<string, unknown>)[field];
    }
  }
  return body;
}

/** Encrypt a packet's body fields. Returns a new packet with encrypted body. */
export function encryptPacket(
  packet: YapPacket,
  sharedSecret: Buffer,
  signingKey: string,
): YapPacket {
  const body = extractBody(packet);
  const plaintext = JSON.stringify(body);
  const { ciphertext, nonce, tag } = encrypt(plaintext, sharedSecret);

  // Build encrypted packet — routing header stays cleartext
  const encrypted: YapPacket = {
    protocol: packet.protocol,
    packet_id: packet.packet_id,
    thread_id: packet.thread_id,
    from: packet.from,
    to: packet.to,
    timestamp: packet.timestamp,
    type: packet.type,
    encrypted: true,
    ciphertext: `${ciphertext}.${tag}`, // combine for wire format
    nonce,
  };

  // Sign the full packet
  encrypted.signature = sign(JSON.stringify(encrypted), signingKey);
  return encrypted;
}

/** Decrypt an encrypted packet. Returns the original packet with body restored. */
export function decryptPacket(
  packet: YapPacket,
  sharedSecret: Buffer,
  signingPublicKey?: string,
): YapPacket {
  if (!packet.encrypted || !packet.ciphertext || !packet.nonce) {
    return packet; // Not encrypted, pass through
  }

  // Verify signature if public key provided
  if (signingPublicKey && packet.signature) {
    const sig = packet.signature;
    const toVerify = { ...packet };
    delete toVerify.signature;
    if (!verify(JSON.stringify(toVerify), sig, signingPublicKey)) {
      throw new Error("Signature verification failed");
    }
  }

  const [ciphertext, tag] = packet.ciphertext.split(".");
  const body = JSON.parse(decrypt({ ciphertext, nonce: packet.nonce, tag }, sharedSecret));

  // Reconstruct original packet
  return {
    ...packet,
    ...body,
    encrypted: undefined,
    ciphertext: undefined,
    nonce: undefined,
    signature: undefined,
  } as YapPacket;
}
