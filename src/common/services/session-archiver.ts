/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { exportSsoFlow } from "@/application/export-sso-flow.ts";
import { importHttpArchive } from "@/application/import-http-archive.ts";
import { type HttpArchiveJson } from "@/core/http/http-archive.ts";

export async function dumpSessionArchive(
  _tabId: number,
  ssoTraceId: string,
): Promise<HttpArchiveJson | Error> {
  return await exportSsoFlow(ssoTraceId);
}

export async function loadSessionArchive(
  _tabId: number,
  httpArchiveJson: HttpArchiveJson,
): Promise<string[] | Error> {
  return await importHttpArchive(httpArchiveJson);
}
