import { expect, test } from "@playwright/test";
import { registerStudent } from "./helpers";

test.describe.configure({ timeout: 120_000 });

test.describe("JAMB mock journey", () => {
  test("register → JAMB mock → partial answers → submit → results", async ({ page }) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `e2e_jamb_${suffix}@example.com`;
    const password = "E2ePass123!";

    await registerStudent(page, "E2E JAMB Student", email, password);

    await expect(page.getByRole("heading", { name: /hi, e2e jamb student/i })).toBeVisible();

    await page.getByRole("button", { name: "JAMB mock" }).click();
    await expect(page).toHaveURL(/\/exam$/);
    await expect(page.getByRole("heading", { name: /jamb.*mock session/i })).toBeVisible();
    await expect(page.getByText(/Answered\s+\d+\s*\/\s*100/)).toBeVisible();

    await page.locator("button").filter({ hasText: /^A\./ }).first().click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.locator("button").filter({ hasText: /^B\./ }).first().click();

    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByText("Overall score", { exact: true })).toBeVisible();
    await expect(page.locator("text=/JAMB/i").first()).toBeVisible();
  });
});
