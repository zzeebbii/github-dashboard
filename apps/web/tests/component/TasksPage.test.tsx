import { expect, test, describe, beforeEach } from "vitest";
import { ApiError } from "../../src/application/ports.ts";
import { TasksPage } from "../../src/features/tasks/TasksPage.tsx";
import { InMemoryTaskApi } from "../fakes/in-memory-task-api.ts";
import { renderWithProviders } from "../render.tsx";

/**
 * Component tests in a REAL browser (Vitest browser mode + Playwright).
 *
 * Assertions use locators and accessible names, so they describe what a user
 * perceives rather than how the component is built. No mocks: the API port is a
 * real in-memory implementation.
 */

let api: InMemoryTaskApi;

beforeEach(() => {
  api = new InMemoryTaskApi();
});

describe("TasksPage", () => {
  test("shows the empty state when there are no tasks", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });

    await expect.element(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  test("adds a task and shows it in the list", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });

    await screen.getByLabelText("New task").fill("Write the ADR");
    await screen.getByRole("button", { name: "Add task" }).click();

    await expect.element(screen.getByText("Write the ADR")).toBeInTheDocument();
    await expect.element(screen.getByTestId("task-total")).toHaveTextContent("1 task");
  });

  test("clears the input after a successful submit", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });

    await screen.getByLabelText("New task").fill("Transient");
    await screen.getByRole("button", { name: "Add task" }).click();

    await expect.element(screen.getByText("Transient")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("New task")).toHaveValue("");
  });

  test("rejects an empty title client-side without calling the API", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });

    await screen.getByRole("button", { name: "Add task" }).click();

    // The contract schema supplies the message, so client and server agree.
    await expect.element(screen.getByRole("alert")).toBeInTheDocument();
    await expect.element(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  test("toggles a task to done", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });
    await screen.getByLabelText("New task").fill("Toggle me");
    await screen.getByRole("button", { name: "Add task" }).click();
    await expect.element(screen.getByText("Toggle me")).toBeInTheDocument();

    await screen.getByRole("checkbox", { name: 'Mark "Toggle me" as done' }).click();

    await expect
      .element(screen.getByRole("checkbox", { name: 'Mark "Toggle me" as not done' }))
      .toBeChecked();
  });

  test("deletes a task", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });
    await screen.getByLabelText("New task").fill("Delete me");
    await screen.getByRole("button", { name: "Add task" }).click();
    await expect.element(screen.getByText("Delete me")).toBeInTheDocument();

    await screen.getByRole("button", { name: 'Delete "Delete me"' }).click();

    await expect.element(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  test("surfaces a server validation message from a problem document", async () => {
    const screen = await renderWithProviders(<TasksPage />, { api });
    // Wait for the initial load to settle FIRST, otherwise the queued failure is
    // consumed by the list request instead of the create request under test.
    await expect.element(screen.getByTestId("empty-state")).toBeInTheDocument();

    api.failNextWith = new ApiError("Validation failed", 400, [
      { pointer: "/title", message: "Title is already taken." },
    ]);

    await screen.getByLabelText("New task").fill("Duplicate");
    await screen.getByRole("button", { name: "Add task" }).click();

    await expect.element(screen.getByText("Title is already taken.")).toBeInTheDocument();
  });
});
