import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  timingSafeEqual,
} from "node:crypto";
import { config } from "./config.js";
export const random = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const emailHash = (v: string) =>
  createHmac("sha256", Buffer.from(config.PAIRWISE_KEY, "hex"))
    .update("email:" + v)
    .digest("hex");
export const pairwise = (user: string, client: string) =>
  createHmac("sha256", Buffer.from(config.PAIRWISE_KEY, "hex"))
    .update(JSON.stringify([user, client]))
    .digest("base64url");
export function equal(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function encrypt(data: Buffer | string, context: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(config.DATA_KEY, "hex"),
    iv,
  );
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
export function decrypt(data: Buffer, context: string): Buffer {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(config.DATA_KEY, "hex"),
    data.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
}
export const seal = (value: unknown, context: string) =>
  encrypt(JSON.stringify(value), context).toString("base64");
export const unseal = <T = any>(value: string, context: string): T =>
  JSON.parse(decrypt(Buffer.from(value, "base64"), context).toString());
const privateKey = createPrivateKey(
  Buffer.from(config.ISSUER_PRIVATE_KEY, "base64").toString(),
);
export const issuerPublicKey = createPublicKey(privateKey)
  .export({ type: "spki", format: "pem" })
  .toString();
export const signPayload = (payload: string) =>
  sign(null, Buffer.from(payload), privateKey).toString("base64url");
export const verifyPayload = (payload: string, signature: string) =>
  verify(
    null,
    Buffer.from(payload),
    issuerPublicKey,
    Buffer.from(signature, "base64url"),
  );
