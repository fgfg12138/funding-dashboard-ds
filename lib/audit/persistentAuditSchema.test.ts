/**
 * Persistent Audit Schema Tests — Phase 6.1
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPersistentAuditTables,
  getRetentionPolicy,
  sanitizePersistentAuditMetadata,
  buildMetadataHashSkeleton,
  validatePersistentAuditEventShape,
  getDefaultRetentionPolicies,
} from "./persistentAuditSchema";
import type { CreatePersistentAuditEventInput } from "./persistentAuditTypes";

// ─── Tables ──────────────────────────────────────────────

describe("getPersistentAuditTables", () => {
  const tables = getPersistentAuditTables();

  it("returns 3 tables", () => {
    expect(tables.length).toBe(3);
  });

  it("includes audit_events", () => {
    expect(tables).toContain("audit_events");
  });

  it("includes audit_event_metadata", () => {
    expect(tables).toContain("audit_event_metadata");
  });

  it("includes audit_integrity_checks", () => {
    expect(tables).toContain("audit_integrity_checks");
  });
});

// ─── Retention Policies ─────────────────────────────────

describe("getRetentionPolicy", () => {
  it("local: 7 days", () => {
    const p = getRetentionPolicy("local");
    expect(p.retentionDays).toBe(7);
  });

  it("staging: 30 days", () => {
    const p = getRetentionPolicy("staging");
    expect(p.retentionDays).toBe(30);
  });

  it("production: 90 days", () => {
    const p = getRetentionPolicy("production");
    expect(p.retentionDays).toBe(90);
  });

  it("unknown env defaults to local", () => {
    const p = getRetentionPolicy("unknown");
    expect(p.retentionDays).toBe(7);
  });
});

describe("getDefaultRetentionPolicies", () => {
  it("returns 3 policies", () => {
    expect(getDefaultRetentionPolicies().length).toBe(3);
  });
});

// ─── Sanitize Metadata ──────────────────────────────────

describe("sanitizePersistentAuditMetadata", () => {
  it("returns empty object for undefined", () => {
    expect(sanitizePersistentAuditMetadata(undefined)).toEqual({});
  });

  it("keeps safe fields", () => {
    const result = sanitizePersistentAuditMetadata({ symbol: "BTCUSDT", quantity: 0.01 });
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.quantity).toBe(0.01);
  });

  it("removes secret fields", () => {
    const result = sanitizePersistentAuditMetadata({
      symbol: "BTCUSDT",
      apiSecret: "sk-abc123",
      password: "p@ss",
      privateKey: "0xdeadbeef",
    });
    expect(result.symbol).toBe("BTCUSDT");
    expect(result.apiSecret).toBeUndefined();
    expect(result.password).toBeUndefined();
    expect(result.privateKey).toBeUndefined();
  });

  it("adds redacted markers", () => {
    const result = sanitizePersistentAuditMetadata({
      apiSecret: "sk-abc",
      signature: "0xsig",
    });
    expect(result._apiSecret_redacted).toBe(true);
    expect(result._signature_redacted).toBe(true);
  });
});

// ─── Build Metadata Hash ────────────────────────────────

describe("buildMetadataHashSkeleton", () => {
  it("returns pa-hash-empty for undefined", () => {
    expect(buildMetadataHashSkeleton(undefined)).toBe("pa-hash-empty");
  });

  it("returns deterministic hash", () => {
    const h1 = buildMetadataHashSkeleton({ symbol: "BTCUSDT", side: "Buy" });
    const h2 = buildMetadataHashSkeleton({ symbol: "BTCUSDT", side: "Buy" });
    expect(h1).toBe(h2);
  });

  it("different input produces different hash", () => {
    const h1 = buildMetadataHashSkeleton({ symbol: "BTCUSDT" });
    const h2 = buildMetadataHashSkeleton({ symbol: "ETHUSDT" });
    expect(h1).not.toBe(h2);
  });

  it("starts with pa-hash- prefix", () => {
    const hash = buildMetadataHashSkeleton({ symbol: "BTCUSDT" });
    expect(hash).toMatch(/^pa-hash-/);
  });
});

// ─── Validate Event Shape ───────────────────────────────

describe("validatePersistentAuditEventShape", () => {
  const validInput: CreatePersistentAuditEventInput = {
    eventType: "order_submitted",
    actor: "system",
    severity: "info",
    source: "testnet-route",
    message: "Order submitted to testnet",
    metadata: { symbol: "BTCUSDT" },
  };

  it("passes for valid input", () => {
    const result = validatePersistentAuditEventShape(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails when eventType is empty", () => {
    const result = validatePersistentAuditEventShape({ ...validInput, eventType: "" });
    expect(result.valid).toBe(false);
  });

  it("fails when actor is empty", () => {
    const result = validatePersistentAuditEventShape({ ...validInput, actor: "" });
    expect(result.valid).toBe(false);
  });

  it("fails when severity is invalid", () => {
    const result = validatePersistentAuditEventShape({
      ...validInput,
      severity: "critical" as any,
    });
    expect(result.valid).toBe(false);
  });

  it("fails when source is invalid", () => {
    const result = validatePersistentAuditEventShape({
      ...validInput,
      source: "unknown-source" as any,
    });
    expect(result.valid).toBe(false);
  });

  it("fails when message is empty", () => {
    const result = validatePersistentAuditEventShape({ ...validInput, message: "" });
    expect(result.valid).toBe(false);
  });
});

// ─── Static Analysis ─────────────────────────────────────

describe("persistentAuditSchema — static analysis", () => {
  const files = ["persistentAuditSchema.ts", "persistentAuditTypes.ts"];

  for (const file of files) {
    const content = readFileSync(join(__dirname, file), "utf8");
    const noComments = content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    it(`${file} does not import sqlite`, () => {
      expect(content).not.toContain("sqlite");
    });

    it(`${file} does not import postgres`, () => {
      expect(content).not.toContain("postgres");
    });

    it(`${file} does not import prisma`, () => {
      expect(content).not.toContain("prisma");
    });

    it(`${file} does not contain fetch(`, () => {
      expect(noComments).not.toContain("fetch(");
    });

    it(`${file} does not contain axios`, () => {
      expect(content).not.toContain("axios");
    });

    it(`${file} does not contain decryptSecret`, () => {
      expect(content).not.toContain("decryptSecret");
    });

    it(`${file} does not contain importMasterKey`, () => {
      expect(content).not.toContain("importMasterKey");
    });

    it(`${file} does not contain createHmac`, () => {
      expect(content).not.toContain("createHmac");
    });
  }
});
