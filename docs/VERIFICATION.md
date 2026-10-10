# Local verification record

Validated on Windows with Node.js 22.23.2, PostgreSQL 18.4, Prisma 6.19.3, official Circom 2.2.3, snarkjs 0.7.6, and installed Microsoft Edge.

- Both committed PostgreSQL migrations applied successfully to a dedicated `proofgate_test` database on port 55432. No Docker or Windows service installation was used.
- The circuit compiled to R1CS/WebAssembly; the development Powers of Tau and final Groth16 proving key passed verification.
- TypeScript checking and the Vite production build passed.
- All **16 Vitest tests** passed across cryptography, storage/security primitives, and PostgreSQL integration.
- The **Playwright end-to-end test** passed: registration, profile save, upload, three credential types, real age proof, email disclosure, qualification disclosure, decline, desktop/mobile rendering, and no horizontal overflow at a 390px viewport.
- Frontend and gateway live checks returned HTTP 200 and `status: ready`. Backend startup generates and verifies an actual self-test proof before listening.
- Final production dependency audit: **15 low, 0 moderate, 0 high, 0 critical** advisories. The remaining transitive packages are listed and scoped in SECURITY.md.

The browser journey uses synthetic test data; SMTP delivery and a live ClamAV service were not available and were **not tested**. Their unconfigured development behavior is explicit. No production setup ceremony or independent security audit has been performed.

The user's normal `.env` still contains the `DATABASE_URL` password placeholder. Normal operation against `localhost:5432/proofgate` requires the user to configure that connection and run database initialization/migration/seeding. The verified isolated test environment does not change that configuration. README.md provides both paths and the exact commands.
