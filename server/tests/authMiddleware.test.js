import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { parseBearerToken, verifyAdminFromToken } from "../src/middlewares/authMiddleware.js";

describe("authMiddleware", () => {
  const secret = "unit-test-jwt-secret";

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
  });

  it("parseBearerToken returns null without Bearer prefix", () => {
    assert.equal(parseBearerToken(undefined), null);
    assert.equal(parseBearerToken("Token abc"), null);
    assert.equal(parseBearerToken("Bearer "), null);
  });

  it("parseBearerToken extracts token string", () => {
    assert.equal(parseBearerToken("Bearer eyJhbGciOi"), "eyJhbGciOi");
  });

  it("verifyAdminFromToken resolves admin via lookup", async () => {
    const adminId = "507f1f77bcf86cd799439011";
    const token = jwt.sign({ id: adminId }, secret, { expiresIn: "1h" });
    const fakeAdmin = { _id: adminId, email: "admin@test.com" };
    const admin = await verifyAdminFromToken(token, async (id) => (id === adminId ? fakeAdmin : null));
    assert.equal(admin.email, "admin@test.com");
  });

  it("verifyAdminFromToken rejects unknown admin", async () => {
    const token = jwt.sign({ id: "missing" }, secret);
    await assert.rejects(
      () => verifyAdminFromToken(token, async () => null),
      (err) => err.message === "Invalid token user"
    );
  });

  it("verifyAdminFromToken rejects expired token", async () => {
    const token = jwt.sign({ id: "x" }, secret, { expiresIn: "-1s" });
    await assert.rejects(() => verifyAdminFromToken(token, async () => ({ _id: "x" })));
  });
});
