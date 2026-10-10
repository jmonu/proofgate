import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import { powersOfTau, zKey } from "snarkjs";
import { getCurveFromName } from "ffjavascript";
const out = resolve("cryptography/build");
await mkdir(resolve(out, "age_js"), { recursive: true });
const run = (file, args) => {
  const result = spawnSync(process.execPath, [file, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error("Circuit compilation failed.");
};
run("scripts/compile-circuit.mjs", []);
const f = (name) => resolve(out, name);
const curve = await getCurveFromName("bn128", true);
try {
  console.log(
    "Creating development-only Groth16 ceremony (power 12). This is not a production trusted setup.",
  );
  await powersOfTau.newAccumulator(curve, 12, f("pot0.ptau"));
  await powersOfTau.contribute(
    f("pot0.ptau"),
    f("pot1.ptau"),
    "Local demo contribution",
    randomBytes(64).toString("hex"),
  );
  await powersOfTau.preparePhase2(f("pot1.ptau"), f("pot_final.ptau"));
  if (!(await powersOfTau.verify(f("pot_final.ptau"))))
    throw new Error("Powers of Tau verification failed.");
  await zKey.newZKey(f("age.r1cs"), f("pot_final.ptau"), f("age0.zkey"));
  await zKey.contribute(
    f("age0.zkey"),
    f("age_final.zkey"),
    "Local demo phase 2",
    randomBytes(64).toString("hex"),
  );
  if (
    !(await zKey.verifyFromR1cs(
      f("age.r1cs"),
      f("pot_final.ptau"),
      f("age_final.zkey"),
    ))
  )
    throw new Error("ZKey verification failed.");
  const key = await zKey.exportVerificationKey(f("age_final.zkey"));
  await writeFile(f("verification_key.json"), JSON.stringify(key, null, 2));
  const manifest = {
    mode: "single-machine-demo-only",
    circuitSha256: createHash("sha256")
      .update(await readFile("cryptography/age.circom"))
      .digest("hex"),
    createdAt: new Date().toISOString(),
  };
  await writeFile(f("manifest.json"), JSON.stringify(manifest, null, 2));
  await Promise.all(
    ["pot0.ptau", "pot1.ptau", "age0.zkey"].map((n) => unlink(f(n))),
  );
  console.log(
    "Circuit, proving key, verification key and verified setup ready.",
  );
} finally {
  await curve.terminate();
}
process.exit(0);
