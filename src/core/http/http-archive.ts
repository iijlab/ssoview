/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// WIP

import { type HttpMessage, isHttpMessage } from "@/core/http/http-message.ts";
import { isObject } from "@/shared/type-guard.ts";

export type HttpArchiveJson = string;

const ARCHIVE_FORMAT_VERSION = 1;

export type HttpArchive = {
  version: number;
  httpMessages: HttpMessage[];
};

function isHttpArchive(u: unknown): u is HttpArchive {
  return isObject(u) && Array.isArray(u.httpMessages) && u.httpMessages.every(isHttpMessage);
}

export function newHttpArchive(httpMessages: HttpMessage[]): HttpArchive {
  return {
    version: ARCHIVE_FORMAT_VERSION,
    httpMessages,
  };
}

export function toHttpArchiveJson(httpArchive: HttpArchive): HttpArchiveJson {
  return JSON.stringify(httpArchive);
}

export function parseHttpArchiveJson(httpArchiveJson: HttpArchiveJson): HttpArchive | Error {
  try {
    const httpArchive = JSON.parse(httpArchiveJson);
    if (!isHttpArchive(httpArchive)) {
      return new Error("Invalid HTTP archive");
    }

    return httpArchive;
  } catch (err) {
    return new Error("Failed to parse HTTP archive", { cause: err });
  }
}
