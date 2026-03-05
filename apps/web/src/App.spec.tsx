import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, test } from "vitest";
import { App } from "./App";

describe("App shell", () => {
  test("renders phase 2 shell sections", () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );

    expect(screen.getByText("Recycling Swap-Shop")).toBeInTheDocument();
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
  });
});
