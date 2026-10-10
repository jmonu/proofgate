import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const releases = {
  win32: [
    "circom-windows-amd64.exe",
    "e43f132ee6f0aa79b705beceb59c2a7e6a54d7bdeab917ca34e9fc1951d185e1",
  ],
  linux: [
    "circom-linux-amd64",
    "85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3",
  ],
  darwin: [
    "circom-macos-amd64",
    "e006332b3fe225f11c3b87bd2debbf5d7f568d6efbde25e5a6a12cd6988c8ecb",
  ],
};
const release = releases[process.platform];
if (!release || process.arch !== "x64")
  throw new Error(
    "Automated compiler supports x64 Windows, Linux, macOS. Install official Circom 2.2.3 for other architectures.",
  );
await mkdir("private/tools", { recursive: true });
const executable = resolve("private/tools", release[0]);
const digest = (b) => createHash("sha256").update(b).digest("hex");
let binary = await readFile(executable).catch(() => null);
if (!binary) {
  console.log("Downloading official Circom 2.2.3 compiler…");
  const response = await fetch(
    `https://github.com/iden3/circom/releases/download/v2.2.3/${release[0]}`,
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok)
    throw new Error("Compiler download failed: " + response.status);
  binary = Buffer.from(await response.arrayBuffer());
  if (digest(binary) !== release[1])
    throw new Error("Compiler checksum mismatch.");
  await writeFile(executable, binary, { mode: 0o755 });
}
if (digest(binary) !== release[1])
  throw new Error(
    "Installed compiler checksum mismatch. Remove it and rebuild.",
  );
if (process.platform !== "win32") await chmod(executable, 0o755);
const result = spawnSync(
  executable,
  [
    "cryptography/age.circom",
    "--r1cs",
    "--wasm",
    "--sym",
    "-l",
    "node_modules",
    "-o",
    "cryptography/build",
  ],
  { stdio: "inherit" },
);
if (result.status !== 0)
  throw new Error(`Official circuit compiler failed (${result.status}).`);
