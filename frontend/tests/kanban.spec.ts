import { expect, test, type Page } from "@playwright/test";

const login = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();
};

test("requires login before showing kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("loads the kanban board after login", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const cardTitle = `Playwright card ${Date.now()}`;
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(cardTitle);
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(cardTitle)).toBeVisible();
});

test("persists board changes across refresh", async ({ page }) => {
  await login(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  const uniqueTitle = `Persisted card ${Date.now()}`;

  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill(uniqueTitle);
  await firstColumn.getByPlaceholder("Details").fill("Persistence check");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText(uniqueTitle)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /log out/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]').first().getByText(uniqueTitle)).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await login(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("applies ai chat board update in the UI", async ({ page }) => {
  await login(page);
  const token = await page.evaluate(() => window.sessionStorage.getItem("pm_auth_token"));
  if (!token) {
    throw new Error("Missing auth token after login.");
  }

  await page.getByRole("button", { name: /^ai chat$/i }).click();

  await page.route("**/api/ai/chat", async (route) => {
    const boardResponse = await page.request.get("/api/board", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const boardPayload = (await boardResponse.json()) as {
      board: {
        columns: Array<{ id: string; title: string; cardIds: string[] }>;
        cards: Record<string, { id: string; title: string; details: string }>;
      };
    };
    const updatedBoard = {
      ...boardPayload.board,
      columns: boardPayload.board.columns.map((column, index) =>
        index === 0 ? { ...column, title: "Now" } : column
      ),
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assistant_message: "Updated.",
        board_update: updatedBoard,
      }),
    });
  });

  await page.getByLabel("Message").fill("Rename backlog to now");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText("Updated.")).toBeVisible();
  await expect(page.getByTestId("column-col-backlog").getByLabel("Column title")).toHaveValue(
    "Now"
  );
});

test("logs out to return to login screen", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /log out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();
});
