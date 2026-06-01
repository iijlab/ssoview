/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { red } from "@mui/material/colors";

const ErrorPage = ({ msg, testId }: { msg: string; testId?: string }) => {
  return (
    <>
      <h1
        style={{
          color: red[500],
          textAlign: "center",
        }}
      >
        Internal Error
      </h1>
      <p
        style={{
          fontSize: "large",
          textAlign: "center",
          marginBottom: "2rem",
        }}
      >
        Please reopen the side panel.
      </p>
      <pre
        style={{
          fontSize: "large",
        }}
      >
        Error:
      </pre>
      <pre
        style={{
          fontSize: "medium",
          paddingLeft: "0.5rem",
        }}
        data-testid={testId}
      >
        {msg}
      </pre>
    </>
  );
};

export { ErrorPage };
