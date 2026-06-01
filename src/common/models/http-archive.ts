/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// WIP

import { isHttpMessage, type HttpMessage } from "@/common/models/http-message.ts";
import { isObject } from "@/common/utils/type-guard.ts";

export type Har = string;

const ARCHIVE_FORMAT_VERSION = 1;

type HttpArchive = {
  version: number;
  httpMessages: HttpMessage[];
};

function isHttpArchive(u: unknown): u is HttpArchive {
  return isObject(u) && Array.isArray(u.httpMessages) && u.httpMessages.every(isHttpMessage);
}

export function newHar(httpMessages: HttpMessage[]): Har {
  const httpArchive: HttpArchive = {
    version: ARCHIVE_FORMAT_VERSION,
    httpMessages,
  };
  return JSON.stringify(httpArchive);
}

export function toHttpMessages(har: Har): HttpMessage[] | Error {
  try {
    const httpArchive = JSON.parse(har);
    if (!isHttpArchive(httpArchive)) {
      return new Error("Invalid HTTP archive");
    }

    return httpArchive.httpMessages;
  } catch (err) {
    return new Error("Failed to parse HTTP archive", { cause: err });
  }
}
