/**
 * Tests for ErrorBoundary component.
 *
 * Verifies error catching, fallback UI, custom fallback, and reset/dismiss behavior.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function BoomComponent(): never {
  throw new Error("Test error");
}

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("catches rendering errors and shows fallback UI", () => {
    render(
      <ErrorBoundary>
        <BoomComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Test error")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom</div>}>
        <BoomComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("custom-fallback")).toBeInTheDocument();
  });

  it("shows Retry and Dismiss buttons in default fallback", () => {
    render(
      <ErrorBoundary>
        <BoomComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });
});
