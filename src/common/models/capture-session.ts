/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export type CaptureSession = {
  id: string;
} & (
  | {
      imported: false;
      startedAt: string;
      endedAt?: string;
    }
  | {
      imported: true;
      importedAt: string;
    }
);
