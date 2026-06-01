/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type { SessionSummary } from "@/common/models/session-summary.ts";

const testSessionSummaries: SessionSummary[] = [
  // (captured, true, in_progress)
  {
    protocol: "saml",
    imported: false,
    capturing: true,
    sessionId: "ONELOGIN_00000000-0000-4000-A000-000000000002",
    warning: [],
    start: "2025-01-01T00:02:20.000Z",
    // end: "2025-01-01T00:02:25.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "in_progress",
    action: "Service Provider returns the requested resource",
  },
  // (captured, true, succeeded)
  {
    protocol: "saml",
    imported: false,
    capturing: true,
    sessionId: "ONELOGIN_00000000-0000-4000-A000-000000000001",
    warning: [],
    start: "2025-01-01T00:02:10.000Z",
    end: "2025-01-01T00:02:15.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "succeeded",
    action: "Service Provider returns the requested resource",
  },
  // (captured, true, failed)
  {
    protocol: "saml",
    imported: false,
    capturing: true,
    sessionId: "ONELOGIN_00000000-0000-4000-A000-000000000000",
    warning: [],
    start: "2025-01-01T00:02:00.000Z",
    end: "2025-01-01T00:02:05.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "failed",
    action: "Service Provider returns the requested resource",
  },
  // (captured, false, in_progress)
  {
    protocol: "saml",
    imported: false,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-9000-000000000002",
    warning: [],
    start: "2025-01-01T00:01:20.000Z",
    // end: "2025-01-01T00:01:25.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "in_progress",
    action: "Service Provider returns the requested resource",
  },
  // (captured, false, succeeded)
  {
    protocol: "saml",
    imported: false,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-9000-000000000001",
    warning: [],
    start: "2025-01-01T00:01:10.000Z",
    end: "2025-01-01T00:01:15.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "succeeded",
    action: "Service Provider returns the requested resource",
  },
  // (captured, false, failed)
  {
    protocol: "saml",
    imported: false,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-9000-000000000000",
    warning: [],
    start: "2025-01-01T00:01:00.000Z",
    end: "2025-01-01T00:01:05.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "failed",
    action: "Service Provider returns the requested resource",
  },
  // (imported, false, in_progress)
  {
    protocol: "saml",
    imported: true,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-8000-000000000002",
    warning: [],
    start: "2025-01-01T00:00:20.000Z",
    // end: "2025-01-01T00:00:25.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "in_progress",
    action: "User redirects SAML AuthnRequest to Identity Provider",
  },
  // (imported, false, succeeded)
  {
    protocol: "saml",
    imported: true,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-8000-000000000001",
    warning: [],
    start: "2025-01-01T00:00:10.000Z",
    end: "2025-01-01T00:00:15.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "succeeded",
    action: "Service Provider returns the requested resource",
  },
  // (imported, false, failed)
  {
    protocol: "saml",
    imported: true,
    capturing: false,
    sessionId: "ONELOGIN_00000000-0000-4000-8000-000000000000",
    warning: [],
    start: "2025-01-01T00:00:00.000Z",
    // end: "2025-01-01T00:00:05.000Z",
    sp: "localhost",
    idp: "localhost",
    status: "failed",
    action: "User redirects SAML AuthnRequest to Identity Provider",
  },
];

export { testSessionSummaries };
