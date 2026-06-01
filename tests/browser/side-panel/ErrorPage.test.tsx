/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// target
import { ErrorPage } from "@/side-panel/ErrorPage.tsx";
// test
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

describe("ErrorPage", () => {
  const testId = "error-page";
  const msg = "This is the test error message";

  test("Render: ErrorPage", () => {
    render(<ErrorPage msg={msg} testId={testId} />);
    // screen.debug();
    const errorMsg = screen.getByTestId(testId) as HTMLPreElement;
    expect(errorMsg.innerText).toBe(msg);
  });
});
