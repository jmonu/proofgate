import { test, expect } from "@playwright/test";
test("wallet onboarding, real ZK gateway, email disclosure, student claim, decline, and responsive layout", async ({
  page,
}) => {
  const email = `browser-${Date.now()}@example.test`;
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a wallet", exact: true })
    .click();
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-Test-Password!");
  await page.getByLabel("Confirm password").fill("Browser-Test-Password!");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Create wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your identity. Your control." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My Identity", exact: true }).click();
  await page.getByLabel("First name", { exact: true }).fill("Demo");
  await page.getByLabel("Last name", { exact: true }).fill("Member");
  await page.getByLabel("Date of birth", { exact: true }).fill("2000-02-29");
  await page.getByLabel("Phone number").fill("+91 9876543210");
  await page.getByRole("button", { name: "Save identity" }).click();
  await expect(page.getByRole("status")).toContainText("Identity saved");
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await page
    .getByLabel("Upload B.Tech Certificate", { exact: true })
    .setInputFiles({
      name: "test-certificate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"),
    });
  await expect(page.getByRole("status")).toContainText("Document encrypted");
  await page.getByRole("link", { name: /^Credentials/ }).click();
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "Issue test credential" })
      .nth(i)
      .click();
    const dialog = page.getByRole("dialog");
    if (i === 0)
      await dialog
        .getByLabel("Confirm your saved date of birth")
        .fill("2000-02-29");
    for (const checkbox of await dialog.getByRole("checkbox").all())
      await checkbox.check();
    await dialog.getByRole("button", { name: "Issue demo credential" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your identity. Your control." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/wallet-desktop.png",
    fullPage: true,
  });
  for (const [port, status] of [
    [4101, "Age requirement verified"],
    [4102, "Demo email explicitly shared — ownership unverified"],
    [4103, "B.Tech test credential verified"],
  ] as const) {
    await page.goto(`http://localhost:${port}`);
    await page.getByRole("button", { name: /Continue with ProofGate/ }).click();
    await expect(
      page.getByRole("heading", { name: "You choose what to share." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Approve & continue" }).click();
    await expect(page.locator("#status")).toHaveText(status, {
      timeout: 60000,
    });
    const result = await page.locator("#result").innerText();
    expect(result).not.toContain("2000-02-29");
    expect(result).not.toContain("9876543210");
    if (port !== 4102) expect(result).not.toContain(email);
  }
  await page.goto("http://localhost:4101");
  await page.getByRole("button", { name: /Continue with ProofGate/ }).click();
  await page.getByRole("button", { name: "Decline request" }).click();
  await expect(page).toHaveURL(/denied=1/);
  await expect(page.locator("#status")).toHaveText(
    "You declined the request. No attributes were shared.",
  );
  await page.goto("http://localhost:5174/");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Your identity. Your control." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/wallet-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
