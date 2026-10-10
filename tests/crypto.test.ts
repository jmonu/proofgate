import { describe, it, expect } from "vitest";
import {
  proveAge,
  verifyAge,
  poseidonHash,
  newSalt,
  requestField,
} from "../cryptography/proof.js";
import { calculateAge, validDob } from "../backend/src/validation.js";
describe("calendar policy", () => {
  it("checks the birthday boundary and leap-day anniversary", () => {
    expect(calculateAge("2008-10-10", new Date("2026-10-09T23:59:59Z"))).toBe(
      17,
    );
    expect(calculateAge("2008-10-10", new Date("2026-10-10T00:00:00Z"))).toBe(
      18,
    );
    expect(calculateAge("2004-02-29", new Date("2022-02-28T12:00:00Z"))).toBe(
      17,
    );
    expect(calculateAge("2004-02-29", new Date("2022-03-01T00:00:00Z"))).toBe(
      18,
    );
  });
  it("rejects impossible, future, and out-of-range dates", () => {
    expect(validDob("2007-02-29")).toBe(false);
    expect(validDob("2000-02-29")).toBe(true);
    expect(validDob("2100-01-01")).toBe(false);
    expect(validDob("1899-01-01")).toBe(false);
  });
});
describe("real Groth16 proofs", () => {
  it("proves an issued commitment and rejects changed claims, audience/nonce/expiry context and invalid curve points", async () => {
    const salt = newSalt(),
      dob = 20081010,
      commitment = await poseidonHash([dob, salt]);
    const expected = {
      commitment,
      minimumAge: 18,
      asOf: 20261010,
      requestHash: requestField({
        nonce: "one",
        audience: "demo-age",
        expiresAt: "2026-10-10T12:00:00Z",
      }),
    };
    const p = await proveAge({ dob, salt, ...expected });
    expect(await verifyAge(p.proof, p.publicSignals, expected)).toBe(true);
    expect(p.publicSignals).not.toContain(String(dob));
    expect(p.publicSignals).not.toContain(salt);
    expect(
      await verifyAge(p.proof, p.publicSignals, {
        ...expected,
        minimumAge: 21,
      }),
    ).toBe(false);
    expect(
      await verifyAge(p.proof, p.publicSignals, {
        ...expected,
        requestHash: requestField({ nonce: "two", audience: "demo-student" }),
      }),
    ).toBe(false);
    const forged = structuredClone(p.proof);
    forged.pi_a[0] = "0";
    expect(await verifyAge(forged, p.publicSignals, expected)).toBe(false);
    const changed = [...p.publicSignals];
    changed[4] = requestField("other-request");
    expect(
      await verifyAge(p.proof, changed, {
        ...expected,
        requestHash: changed[4],
      }),
    ).toBe(false);
  });
  it("enforces leap-day boundary and rejects a forged DOB for an existing credential", async () => {
    const salt = newSalt(),
      dob = 20040229,
      commitment = await poseidonHash([dob, salt]);
    const base = {
      salt,
      commitment,
      minimumAge: 18,
      requestHash: requestField("leap-day"),
    };
    await expect(proveAge({ dob, ...base, asOf: 20220228 })).rejects.toThrow();
    const p = await proveAge({ dob, ...base, asOf: 20220301 });
    expect(
      await verifyAge(p.proof, p.publicSignals, { ...base, asOf: 20220301 }),
    ).toBe(true);
    await expect(
      proveAge({ dob: 19900101, ...base, asOf: 20220301 }),
    ).rejects.toThrow();
  });
});
