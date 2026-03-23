import { describe, it, expect } from "vitest";
import {
  generateEncryptionKeyPair,
  generateSigningKeyPair,
  deriveSharedSecret,
  encrypt,
  decrypt,
  sign,
  verify,
  encryptPacket,
  decryptPacket,
  createEphemeralSession,
  completeEphemeralSession,
  getSessionKey,
  destroyEphemeralSession,
} from "../src/crypto.js";
import type { YapPacket } from "../src/types.js";

describe("Key generation", () => {
  it("generates valid X25519 encryption key pairs", () => {
    const kp = generateEncryptionKeyPair();
    expect(kp.publicKey).toBeTruthy();
    expect(kp.secretKey).toBeTruthy();
    // Base64 encoded DER keys should be reasonable length
    expect(Buffer.from(kp.publicKey, "base64").length).toBeGreaterThan(0);
    expect(Buffer.from(kp.secretKey, "base64").length).toBeGreaterThan(0);
  });

  it("generates valid Ed25519 signing key pairs", () => {
    const kp = generateSigningKeyPair();
    expect(kp.publicKey).toBeTruthy();
    expect(kp.secretKey).toBeTruthy();
    expect(Buffer.from(kp.publicKey, "base64").length).toBeGreaterThan(0);
  });

  it("generates unique key pairs each time", () => {
    const a = generateEncryptionKeyPair();
    const b = generateEncryptionKeyPair();
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.secretKey).not.toBe(b.secretKey);
  });
});

describe("Shared secret derivation (HKDF)", () => {
  it("derives the same shared secret from both sides", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();

    const secretAlice = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const secretBob = deriveSharedSecret(bob.secretKey, alice.publicKey);

    expect(secretAlice.toString("hex")).toBe(secretBob.toString("hex"));
  });

  it("produces a 32-byte key", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();
    const secret = deriveSharedSecret(alice.secretKey, bob.publicKey);
    expect(secret.length).toBe(32);
  });

  it("produces different secrets for different key pairs", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();
    const charlie = generateEncryptionKeyPair();

    const s1 = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const s2 = deriveSharedSecret(alice.secretKey, charlie.publicKey);
    expect(s1.toString("hex")).not.toBe(s2.toString("hex"));
  });
});

describe("AES-256-GCM encryption", () => {
  it("encrypts and decrypts correctly", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();
    const secret = deriveSharedSecret(alice.secretKey, bob.publicKey);

    const plaintext = "Hello, Yap protocol!";
    const encrypted = encrypt(plaintext, secret);
    const decrypted = decrypt(encrypted, secret);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random nonce)", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();
    const secret = deriveSharedSecret(alice.secretKey, bob.publicKey);

    const e1 = encrypt("same text", secret);
    const e2 = encrypt("same text", secret);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
    expect(e1.nonce).not.toBe(e2.nonce);
  });

  it("fails to decrypt with wrong key", () => {
    const alice = generateEncryptionKeyPair();
    const bob = generateEncryptionKeyPair();
    const charlie = generateEncryptionKeyPair();

    const rightSecret = deriveSharedSecret(alice.secretKey, bob.publicKey);
    const wrongSecret = deriveSharedSecret(alice.secretKey, charlie.publicKey);

    const encrypted = encrypt("secret message", rightSecret);
    expect(() => decrypt(encrypted, wrongSecret)).toThrow();
  });
});

describe("Ed25519 signing", () => {
  it("signs and verifies correctly", () => {
    const kp = generateSigningKeyPair();
    const data = "important data";
    const sig = sign(data, kp.secretKey);
    expect(verify(data, sig, kp.publicKey)).toBe(true);
  });

  it("rejects verification with wrong key", () => {
    const kp1 = generateSigningKeyPair();
    const kp2 = generateSigningKeyPair();
    const sig = sign("data", kp1.secretKey);
    expect(verify("data", sig, kp2.publicKey)).toBe(false);
  });

  it("rejects verification for tampered data", () => {
    const kp = generateSigningKeyPair();
    const sig = sign("original", kp.secretKey);
    expect(verify("tampered", sig, kp.publicKey)).toBe(false);
  });
});

describe("Packet encryption", () => {
  it("encrypts and decrypts a full packet", () => {
    const alice = generateEncryptionKeyPair();
    const aliceSign = generateSigningKeyPair();
    const bob = generateEncryptionKeyPair();
    const secret = deriveSharedSecret(alice.secretKey, bob.publicKey);

    const packet: YapPacket = {
      protocol: "yap/0.2",
      packet_id: "pkt_test123",
      thread_id: "thr_test456",
      from: "@alice",
      to: "@bob",
      timestamp: new Date().toISOString(),
      type: "context",
      intent: { category: "testing", summary: "Test packet", urgency: "low" },
      context: { message: "Hello Bob" },
      needs: [{ field: "timezone", reason: "need it", priority: "required" }],
    };

    const encrypted = encryptPacket(packet, secret, aliceSign.secretKey);
    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.intent).toBeUndefined();
    expect(encrypted.context).toBeUndefined();

    const decrypted = decryptPacket(encrypted, secret, aliceSign.publicKey);
    expect(decrypted.intent?.category).toBe("testing");
    expect(decrypted.context?.message).toBe("Hello Bob");
    expect(decrypted.needs?.[0].field).toBe("timezone");
  });

  it("passes through unencrypted packets", () => {
    const packet: YapPacket = {
      protocol: "yap/0.2",
      packet_id: "pkt_plain",
      thread_id: "thr_plain",
      from: "@alice",
      to: "@bob",
      timestamp: new Date().toISOString(),
      type: "context",
    };

    const secret = Buffer.alloc(32);
    const result = decryptPacket(packet, secret);
    expect(result).toEqual(packet);
  });
});

describe("Ephemeral sessions (PFS)", () => {
  it("creates and completes an ephemeral session", () => {
    const session = createEphemeralSession("thr_pfs_test");
    expect(session.threadId).toBe("thr_pfs_test");
    expect(session.sessionKey).toBeNull();
    expect(session.ephemeralKeyPair.publicKey).toBeTruthy();

    // Simulate peer's ephemeral key
    const peerSession = createEphemeralSession("thr_pfs_peer");
    const sessionKey = completeEphemeralSession("thr_pfs_test", peerSession.ephemeralKeyPair.publicKey);
    expect(sessionKey.length).toBe(32);

    const retrieved = getSessionKey("thr_pfs_test");
    expect(retrieved?.toString("hex")).toBe(sessionKey.toString("hex"));

    destroyEphemeralSession("thr_pfs_test");
    destroyEphemeralSession("thr_pfs_peer");
    expect(getSessionKey("thr_pfs_test")).toBeNull();
  });

  it("throws for unknown thread", () => {
    expect(() => completeEphemeralSession("thr_unknown", "fake_key")).toThrow();
  });
});
