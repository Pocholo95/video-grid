/**
 * Integration tests for the Shift+click section sync feature.
 *
 * Renders multiple Section components in the same group and verifies that
 * Shift+click on one collapses/expands all siblings to the target state,
 * and that sections already in the target state are not toggled.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("lucide-react", () => ({
  ChevronDown: () => <span className="chevron">▼</span>,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(" "),
}));

vi.mock("@/components/ui/collapsible", () => {
  const Collapsible = ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: () => void;
    children: React.ReactNode;
  }) => {
    const elems = React.Children.toArray(children);
    return (
      <div data-testid={`collapsible-${open ? "open" : "closed"}`}>
        <div data-testid="trigger" onClick={onOpenChange}>
          {elems[0]}
        </div>
        {open && <div data-testid="content">{elems[1]}</div>}
      </div>
    );
  };
  return {
    Collapsible,
    CollapsibleTrigger: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

import Section from "@/components/control/Section";

describe("Section Shift+click sync (integration)", () => {
  let capturedEvents: CustomEvent[];

  beforeEach(() => {
    capturedEvents = [];
    window.addEventListener("section-sync", (e) => {
      if (e instanceof CustomEvent) {
        capturedEvents.push(e);
      }
    });
  });

  it("collapses all sections in group when one is Shift+clicked", async () => {
    const { fireEvent } = await import("@testing-library/react");

    const toggleCounts = [0, 0, 0];
    const ref = { current: [true, true, true] as boolean[] };

    function TestGroup() {
      const [, setTick] = React.useState(0);

      const toggle = (i: number) => {
        ref.current[i] = !ref.current[i];
        toggleCounts[i]++;
        setTick((t) => t + 1);
      };

      return (
        <>
          {[0, 1, 2].map((i) => (
            <Section
              key={i}
              label={`Section ${i + 1}`}
              expanded={ref.current[i]}
              onToggle={() => toggle(i)}
              groupKey="test-group"
            >
              <div>Body {i + 1}</div>
            </Section>
          ))}
        </>
      );
    }

    render(<TestGroup />);

    expect(screen.queryByText("Section 1")).toBeDefined();

    const section1 = screen.getByText("Section 1")!;
    const button1 = section1.closest("button")!;

    fireEvent.pointerDown(button1, { shiftKey: true });
    fireEvent.click(button1);

    expect(ref.current).toEqual([false, false, false]);
    expect(capturedEvents.length).toBeGreaterThan(0);
    expect(capturedEvents[0].detail).toEqual({
      group: "test-group",
      expanded: false,
    });
  });

  it("expands all sections in group when one is Shift+clicked", async () => {
    const { fireEvent } = await import("@testing-library/react");

    const ref = { current: [false, false, false] as boolean[] };

    function TestGroup() {
      const [, setTick] = React.useState(0);

      const toggle = (i: number) => {
        ref.current[i] = !ref.current[i];
        setTick((t) => t + 1);
      };

      return (
        <>
          {[0, 1, 2].map((i) => (
            <Section
              key={i}
              label={`Section ${i + 1}`}
              expanded={ref.current[i]}
              onToggle={() => toggle(i)}
              groupKey="test-group"
            >
              <div>Body</div>
            </Section>
          ))}
        </>
      );
    }

    render(<TestGroup />);

    const section2 = screen.getByText("Section 2")!;
    const button2 = section2.closest("button")!;

    fireEvent.pointerDown(button2, { shiftKey: true });
    fireEvent.click(button2);

    expect(ref.current).toEqual([true, true, true]);
  });

  it("converges mixed states to target when Shift+clicked", async () => {
    const { fireEvent } = await import("@testing-library/react");

    const toggleCounts = [0, 0, 0];
    const ref = { current: [true, false, true] as boolean[] };

    function TestGroup() {
      const [, setTick] = React.useState(0);

      const toggle = (i: number) => {
        ref.current[i] = !ref.current[i];
        toggleCounts[i]++;
        setTick((t) => t + 1);
      };

      return (
        <>
          {[0, 1, 2].map((i) => (
            <Section
              key={i}
              label={`Section ${i + 1}`}
              expanded={ref.current[i]}
              onToggle={() => toggle(i)}
              groupKey="test-group"
            >
              <div>Body</div>
            </Section>
          ))}
        </>
      );
    }

    render(<TestGroup />);

    const section1 = screen.getByText("Section 1")!;
    const button1 = section1.closest("button")!;

    fireEvent.pointerDown(button1, { shiftKey: true });
    fireEvent.click(button1);

    expect(toggleCounts[0]).toBe(1);
    expect(toggleCounts[1]).toBe(0);
    expect(toggleCounts[2]).toBe(1);
    expect(ref.current).toEqual([false, false, false]);
  });

  it("sections in different groups do not sync", async () => {
    const { fireEvent } = await import("@testing-library/react");

    const togglesA = [0, 0];
    const togglesB = [0];
    const refA = { current: [true, true] as boolean[] };
    const refB = { current: [true] as boolean[] };

    function IndependentGroups() {
      const [, setTick] = React.useState(0);

      const toggleA = (i: number) => {
        refA.current[i] = !refA.current[i];
        togglesA[i]++;
        setTick((t) => t + 1);
      };
      const toggleB = (i: number) => {
        refB.current[i] = !refB.current[i];
        togglesB[i]++;
        setTick((t) => t + 1);
      };

      return (
        <>
          <Section
            key="a1"
            label="GroupA-1"
            expanded={refA.current[0]}
            onToggle={() => toggleA(0)}
            groupKey="group-a"
          >
            <div>Body</div>
          </Section>
          <Section
            key="a2"
            label="GroupA-2"
            expanded={refA.current[1]}
            onToggle={() => toggleA(1)}
            groupKey="group-a"
          >
            <div>Body</div>
          </Section>
          <Section
            key="b1"
            label="GroupB-1"
            expanded={refB.current[0]}
            onToggle={() => toggleB(0)}
            groupKey="group-b"
          >
            <div>Body</div>
          </Section>
        </>
      );
    }

    render(<IndependentGroups />);

    const a1 = screen.getByText("GroupA-1")!;
    const buttonA1 = a1.closest("button")!;

    fireEvent.pointerDown(buttonA1, { shiftKey: true });
    fireEvent.click(buttonA1);

    expect(togglesA[0]).toBe(1);
    expect(togglesA[1]).toBe(1);
    expect(togglesB[0]).toBe(0);
  });

  it("normal click (no Shift) only toggles the clicked section", async () => {
    const { fireEvent } = await import("@testing-library/react");

    const ref = { current: [true, true, true] as boolean[] };

    function TestGroup() {
      const [, setTick] = React.useState(0);

      const toggle = (i: number) => {
        ref.current[i] = !ref.current[i];
        setTick((t) => t + 1);
      };

      return (
        <>
          {[0, 1, 2].map((i) => (
            <Section
              key={i}
              label={`Section ${i + 1}`}
              expanded={ref.current[i]}
              onToggle={() => toggle(i)}
              groupKey="test-group"
            >
              <div>Body</div>
            </Section>
          ))}
        </>
      );
    }

    render(<TestGroup />);

    const section2 = screen.getByText("Section 2")!;
    const button2 = section2.closest("button")!;

    fireEvent.pointerDown(button2, { shiftKey: false });
    fireEvent.click(button2);

    expect(ref.current).toEqual([true, false, true]);
    expect(capturedEvents.length).toBe(0);
  });
});