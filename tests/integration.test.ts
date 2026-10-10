import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { app } from "../backend/src/app.js";
import { db } from "../backend/src/db.js";
import { config } from "../backend/src/config.js";
const origin = "http://localhost:5174";
const userIds: string[] = [],
  requestIds: string[] = [];
const email = `api-${Date.now()}@example.test`,
  password = "Test-Only-Strong-Password!";
const agent = request.agent(app),
  other = request.agent(app);
let csrf = "",
  otherCsrf = "",
  userId = "",
  docId = "",
  ageId = "";
const claims = [{ type: "age_over", value: 18 }];
const basic = (id = "demo-age") =>
  "Basic " +
  Buffer.from(
    id +
      ":" +
      process.env[
        id === "demo-age"
          ? "DEMO_AGE_SECRET"
          : id === "demo-email"
            ? "DEMO_EMAIL_SECRET"
            : "DEMO_STUDENT_SECRET"
      ],
  ).toString("base64");
const rand = () => randomBytes(32).toString("base64url");
async function newRequest(id = "demo-age", custom?: any) {
  const verifier = rand();
  const types: any = {
    "demo-age": claims,
    "demo-email": [{ type: "email_disclosure" }],
    "demo-student": [{ type: "qualification", value: "btech" }],
  };
  const port = id === "demo-age" ? 4101 : id === "demo-email" ? 4102 : 4103;
  const body = {
    claims: types[id],
    redirectUri: `http://localhost:${port}/callback`,
    state: rand(),
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    ...custom,
  };
  const response = await request(app)
    .post("/api/gateway/requests")
    .set("Authorization", basic(id))
    .send(body);
  if (response.status === 201) requestIds.push(response.body.id);
  return { response, verifier, body };
}
async function review(id: string) {
  return agent.get("/api/gateway/requests/" + id).expect(200);
}
async function approve(id: string, extra = {}) {
  return agent
    .post("/api/gateway/requests/" + id + "/approve")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({ approved: true, ...extra });
}
async function exchange(redirect: string, verifier: string, id = "demo-age") {
  const port = id === "demo-age" ? 4101 : id === "demo-email" ? 4102 : 4103;
  return request(app)
    .post("/api/gateway/token")
    .set("Authorization", basic(id))
    .send({
      code: new URL(redirect).searchParams.get("code"),
      redirectUri: `http://localhost:${port}/callback`,
      codeVerifier: verifier,
    });
}
describe("gateway with real PostgreSQL and proof engine", () => {
  beforeAll(async () => {
    if (!new URL(config.DATABASE_URL).pathname.endsWith("_test"))
      throw new Error(
        "Tests require a dedicated database ending in _test. Run npm run test:db.",
      );
    await db.$connect();
  });
  afterAll(async () => {
    await db.authorization.deleteMany({ where: { id: { in: requestIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });
  it("reports when the database is connected", async () => {
    await request(app)
      .get("/health/database")
      .expect(200)
      .expect({ database: "connected" });
  });
  it("registers, uses hashed passwords, HttpOnly cookies and encrypted email", async () => {
    const r = await agent
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({ email, password, confirmation: password, consent: true })
      .expect(201);
    expect(r.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(r.headers["set-cookie"][0]).toContain("SameSite=Lax");
    const s = await agent.get("/api/auth/session").expect(200);
    csrf = s.body.csrf;
    userId = s.body.id;
    userIds.push(userId);
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.emailCipher).not.toContain(email);
    await other
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        email: "other-" + email,
        password,
        confirmation: password,
        consent: true,
      })
      .expect(201);
    const os = await other.get("/api/auth/session");
    otherCsrf = os.body.csrf;
    userIds.push(os.body.id);
  });
  it("enforces authentication, CSRF, origins and valid calendar inputs", async () => {
    await request(app).get("/api/wallet/identity").expect(401);
    await agent
      .put("/api/wallet/identity")
      .set("Origin", origin)
      .send({})
      .expect(403);
    await agent
      .put("/api/wallet/identity")
      .set("Origin", "http://evil.test")
      .set("X-CSRF-Token", csrf)
      .send({})
      .expect(403);
    const profile = {
      firstName: "Demo",
      middleName: "",
      lastName: "User",
      dob: "2000-02-29",
      gender: "",
      email,
      phone: "+91 9876543210",
    };
    await agent
      .put("/api/wallet/identity")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({ ...profile, dob: "2001-02-29" })
      .expect(400);
    const r = await agent
      .put("/api/wallet/identity")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send(profile)
      .expect(200);
    expect(r.body.trust).toBe("self-entered");
    expect(r.body.age).toBeGreaterThanOrEqual(18);
    expect((await other.get("/api/wallet/identity")).body.profile).toBeNull();
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } })).profile,
    ).not.toContain("2000-02-29");
  });
  it("validates signatures and prevents document IDOR while encrypting files", async () => {
    await agent
      .post("/api/wallet/documents/btech")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .attach("file", Buffer.from("MZ executable"), {
        filename: "fake.pdf",
        contentType: "application/pdf",
      })
      .expect(400);
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
    for (const category of ["tenth", "intermediate", "btech"])
      await agent
        .post("/api/wallet/documents/" + category)
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .attach("file", pdf, {
          filename: "test.pdf",
          contentType: "application/pdf",
        })
        .expect(201);
    const docs = (await agent.get("/api/wallet/documents")).body;
    expect(docs).toHaveLength(3);
    expect(docs.every((d: any) => !d.credentialIssued)).toBe(true);
    docId = docs.find((d: any) => d.category === "btech").id;
    await request(app)
      .get("/api/wallet/documents/" + docId + "/file")
      .expect(401);
    await other.get("/api/wallet/documents/" + docId + "/file").expect(404);
    await other
      .delete("/api/wallet/documents/" + docId)
      .set("Origin", origin)
      .set("X-CSRF-Token", otherCsrf)
      .expect(404);
    const r = await agent
      .get("/api/wallet/documents/" + docId + "/file?download=1")
      .expect(200);
    expect(r.headers["content-type"]).toContain("application/pdf");
    const stored = await db.document.findUniqueOrThrow({
      where: { id: docId },
    });
    expect(
      (await readFile(resolve(config.storage, stored.storageId))).includes(pdf),
    ).toBe(false);
  });
  it("requires explicit test review and issues signed demo credentials", async () => {
    await agent
      .post("/api/credentials/issue")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({ type: "age" })
      .expect(400);
    for (const type of ["age", "email", "qualification"]) {
      const r = await agent
        .post("/api/credentials/issue")
        .set("Origin", origin)
        .set("X-CSRF-Token", csrf)
        .send({
          type,
          reviewed: true,
          understandDemo: true,
          ...(type === "age" ? { dobConfirmation: "2000-02-29" } : {}),
        })
        .expect(201);
      if (type === "age") ageId = r.body.id;
      expect(r.body.trust).toBe("demo-test-only");
    }
  });
  it("authenticates clients and enforces callback/claim allowlists", async () => {
    await request(app).post("/api/gateway/requests").send({}).expect(401);
    expect(
      (
        await newRequest("demo-age", {
          redirectUri: "http://evil.test/callback",
        })
      ).response.status,
    ).toBe(400);
    expect(
      (await newRequest("demo-age", { claims: [{ type: "email_disclosure" }] }))
        .response.status,
    ).toBe(400);
  });
  it("verifies the real age proof, enforces PKCE/audience, and atomically consumes codes", async () => {
    const r = await newRequest();
    await review(r.response.body.id);
    const approved = await approve(r.response.body.id);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect((await exchange(approved.body.redirectUrl, rand())).status).toBe(
      400,
    );
    expect(
      (await exchange(approved.body.redirectUrl, r.verifier, "demo-email"))
        .status,
    ).toBe(400);
    const results = await Promise.all([
      exchange(approved.body.redirectUrl, r.verifier),
      exchange(approved.body.redirectUrl, r.verifier),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const result = results.find((r) => r.status === 200)!.body;
    expect(result.claim).toEqual({
      type: "age_over",
      minimumAge: 18,
      satisfied: true,
    });
    expect(result.method).toBe("groth16");
    for (const privateValue of [
      email,
      "2000-02-29",
      "phone",
      "firstName",
      "commitment",
      "credentialId",
      "proof",
    ])
      expect(JSON.stringify(result)).not.toContain(privateValue);
    expect((await approve(r.response.body.id)).status).toBe(410);
  });
  it("rejects an invalid proof and returns only approved email and qualification claims", async () => {
    const age = await newRequest();
    await review(age.response.body.id);
    const bad = await approve(age.response.body.id, {
      proof: { pi_a: ["0", "0", "0"] },
      publicSignals: ["0", "0", "18", "20261010", "0"],
    });
    expect(bad.status).toBe(400);
    for (const id of ["demo-email", "demo-student"]) {
      const r = await newRequest(id);
      await review(r.response.body.id);
      const approved = await approve(r.response.body.id);
      expect(approved.status).toBe(200);
      const result = await exchange(approved.body.redirectUrl, r.verifier, id);
      expect(result.status).toBe(200);
      if (id === "demo-email") {
        expect(result.body.claim.email).toBe(email);
        expect(result.body.claim.emailOwnership).toBe("unverified-demo");
      } else
        expect(result.body.claim).toEqual({
          type: "qualification",
          value: "btech",
        });
      expect(result.body).not.toHaveProperty("profile");
    }
  });
  it("supports decline, request expiry, revocation and disconnect", async () => {
    const r = await newRequest("demo-email");
    await review(r.response.body.id);
    await agent
      .post("/api/gateway/requests/" + r.response.body.id + "/reject")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .send({})
      .expect(200);
    expect((await approve(r.response.body.id)).status).toBe(410);
    const expired = await newRequest();
    await db.authorization.update({
      where: { id: expired.response.body.id },
      data: { expiresAt: new Date(0) },
    });
    await agent
      .get("/api/gateway/requests/" + expired.response.body.id)
      .expect(410);
    await agent
      .post("/api/credentials/" + ageId + "/revoke")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .expect(200);
    expect(
      (await request(app).get("/api/credentials/status/" + ageId)).body.active,
    ).toBe(false);
    const connection = (await agent.get("/api/wallet/connections")).body.find(
      (c: any) => c.clientId === "demo-email",
    );
    await agent
      .delete("/api/wallet/connections/" + connection.id)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .expect(200);
    const emailResult = await db.authorization.findFirst({
      where: { userId, clientId: "demo-email", status: "exchanged" },
    });
    await request(app)
      .get("/api/gateway/results/" + emailResult!.id)
      .set("Authorization", basic("demo-email"))
      .expect(401);
    await agent
      .delete("/api/wallet/documents/" + docId)
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .expect(200);
    expect(
      await db.credential.count({
        where: { userId, type: "qualification", revokedAt: null },
      }),
    ).toBe(0);
  });
  it("does not store sensitive claim values in audit history and supports logout/login", async () => {
    const logs = (await agent.get("/api/wallet/history")).body;
    expect(JSON.stringify(logs)).not.toContain(email);
    expect(JSON.stringify(logs)).not.toContain("2000-02-29");
    await agent
      .post("/api/auth/logout")
      .set("Origin", origin)
      .set("X-CSRF-Token", csrf)
      .expect(200);
    await agent.get("/api/auth/session").expect(401);
    await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email, password })
      .expect(200);
  });
});
