import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";
import { randomBytes, createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";
const field =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const directory = resolve("cryptography/build");
let poseidonPromise: Promise<any> | undefined;
export async function poseidonHash(values: (string | number)[]) {
  const p = await (poseidonPromise ??= buildPoseidon());
  return p.F.toString(p(values.map(BigInt)));
}
export const newSalt = () =>
  BigInt("0x" + randomBytes(31).toString("hex")).toString();
export function requestField(context: unknown) {
  return (
    BigInt(
      "0x" + createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    ) % field
  ).toString();
}
export async function assertArtifacts() {
  await Promise.all(
    ["age_js/age.wasm", "age_final.zkey", "verification_key.json"].map((p) =>
      access(resolve(directory, p)),
    ),
  );
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  const digest = createHash("sha256")
    .update(await readFile(resolve("cryptography/age.circom")))
    .digest("hex");
  const key = JSON.parse(
    await readFile(resolve(directory, "verification_key.json"), "utf8"),
  );
  if (
    manifest.circuitSha256 !== digest ||
    key.protocol !== "groth16" ||
    key.nPublic !== 5
  )
    throw new Error(
      "Proof artifacts are stale or invalid. Rebuild the circuit.",
    );
}
export async function proveAge(input: {
  dob: number;
  salt: string;
  commitment: string;
  minimumAge: number;
  asOf: number;
  requestHash: string;
}) {
  // Single-thread avoids unbounded worker spawning on large Windows workstations.
  return groth16.fullProve(
    input,
    resolve(directory, "age_js/age.wasm"),
    resolve(directory, "age_final.zkey"),
    undefined,
    undefined,
    { singleThread: true },
  );
}
export async function verifyAge(
  proof: unknown,
  signals: string[],
  expected: {
    commitment: string;
    minimumAge: number;
    asOf: number;
    requestHash: string;
  },
) {
  if (
    signals.length !== 5 ||
    signals.some(
      (s) => typeof s !== "string" || !/^\d+$/.test(s) || BigInt(s) >= field,
    )
  )
    return false;
  if (
    signals[1] !== expected.commitment ||
    signals[2] !== String(expected.minimumAge) ||
    signals[3] !== String(expected.asOf) ||
    signals[4] !== expected.requestHash
  )
    return false;
  try {
    const key = JSON.parse(
      await readFile(resolve(directory, "verification_key.json"), "utf8"),
    );
    return await groth16.verify(key, signals, proof);
  } catch {
    return false;
  }
}
export async function selfTestProofSystem() {
  await assertArtifacts();
  const dob = 20000101,
    salt = newSalt();
  const expected = {
    commitment: await poseidonHash([dob, salt]),
    minimumAge: 18,
    asOf: 20260101,
    requestHash: requestField("ProofGate startup self-test"),
  };
  const generated = await proveAge({ dob, salt, ...expected });
  if (!(await verifyAge(generated.proof, generated.publicSignals, expected)))
    throw new Error("Proof-system self-test failed. Rebuild artifacts.");
}
