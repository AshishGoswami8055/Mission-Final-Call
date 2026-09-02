import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  envEnabled,
  isAdminEnvSyncEnabled,
  isAdminSignupAllowed,
  normalizeAdminEmail,
  validateAdminPassword,
} from "../src/utils/adminAuth.js";

describe("adminAuth", () => {
  const keys = ["ALLOW_ADMIN_SIGNUP", "DEMO_MODE", "ADMIN_SYNC", "OTHER_FLAG"];

  beforeEach(() => {
    for (const key of keys) delete process.env[key];
  });

  it("envEnabled accepts 1/true/yes", () => {
    process.env.OTHER_FLAG = "1";
    assert.equal(envEnabled("OTHER_FLAG"), true);
    process.env.OTHER_FLAG = "true";
    assert.equal(envEnabled("OTHER_FLAG"), true);
    process.env.OTHER_FLAG = "yes";
    assert.equal(envEnabled("OTHER_FLAG"), true);
    process.env.OTHER_FLAG = "0";
    assert.equal(envEnabled("OTHER_FLAG"), false);
  });

  it("signup is off by default", () => {
    assert.equal(isAdminSignupAllowed(), false);
  });

  it("signup is on when ALLOW_ADMIN_SIGNUP or DEMO_MODE", () => {
    process.env.ALLOW_ADMIN_SIGNUP = "1";
    assert.equal(isAdminSignupAllowed(), true);
    delete process.env.ALLOW_ADMIN_SIGNUP;
    process.env.DEMO_MODE = "1";
    assert.equal(isAdminSignupAllowed(), true);
  });

  it("env sync follows ADMIN_SYNC or DEMO_MODE", () => {
    assert.equal(isAdminEnvSyncEnabled(), false);
    process.env.ADMIN_SYNC = "1";
    assert.equal(isAdminEnvSyncEnabled(), true);
  });

  it("normalizes email", () => {
    assert.equal(normalizeAdminEmail("  Ada@CDS.local "), "ada@cds.local");
  });

  it("rejects short passwords", () => {
    assert.equal(validateAdminPassword("short"), "Password must be at least 8 characters");
    assert.equal(validateAdminPassword("longenough"), null);
  });
});
