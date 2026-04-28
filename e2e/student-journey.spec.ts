import { expect, test } from "@playwright/test";
import { registerStudent } from "./helpers";

test.describe("Student journey (I1)", () => {
  test("register → study session → submit → results → dashboard → leaderboard", async ({ page }) => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const email = `e2e_${suffix}@example.com`;
    const password = "E2ePass123!";

    await registerStudent(page, "E2E Student", email, password);
    await expect(page.getByRole("heading", { name: /hi, e2e student/i })).toBeVisible();

    await page.getByRole("button", { name: "Study mode" }).click();
    await expect(page).toHaveURL(/\/exam$/);
    await expect(page.getByRole("heading", { name: /study session/i })).toBeVisible();

    // Answer first question then submit (session allows partial answers)
    await page.locator("button").filter({ hasText: /^A\./ }).first().click();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page).toHaveURL(/\/results$/);
    await expect(page.getByText("Overall score", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/recent sessions/i)).toBeVisible();

    await page.getByRole("button", { name: "Leaderboard" }).click();
    await expect(page).toHaveURL(/\/leaderboard$/);
    await expect(page.getByText("Weekly performance", { exact: true })).toBeVisible();
  });
});
