import { expect, type Page } from "@playwright/test";

export async function registerStudent(page: Page, fullName: string, email: string, password: string): Promise<void> {
  await page.goto("/auth");
  await page.getByLabel(/full name/i).fill(fullName);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
