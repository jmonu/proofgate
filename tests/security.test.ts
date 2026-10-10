import { describe, it, expect } from "vitest";
import {
  encrypt,
  decrypt,
  signPayload,
  verifyPayload,
  pairwise,
} from "../backend/src/security.js";
describe("storage and issuer primitives", () => {
  it("authenticates encrypted content and its owner context", () => {
    const cipher = encrypt("private certificate", "owner-A");
    expect(decrypt(cipher, "owner-A").toString()).toBe("private certificate");
    expect(() => decrypt(cipher, "owner-B")).toThrow();
    cipher[cipher.length - 1] ^= 1;
    expect(() => decrypt(cipher, "owner-A")).toThrow();
  });
  it("validates issuer signatures and rejects modified attributes", () => {
    const payload = '{"trust":"demo","commitment":"42"}',
      signature = signPayload(payload);
    expect(verifyPayload(payload, signature)).toBe(true);
    expect(verifyPayload(payload.replace("42", "43"), signature)).toBe(false);
  });
  it("uses different account identifiers for different websites", () => {
    expect(pairwise("user", "site-a")).not.toBe(pairwise("user", "site-b"));
    expect(pairwise("user", "site-a")).toBe(pairwise("user", "site-a"));
  });
});
