/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { vi } from "vitest";

const chrome = {
  action: {
    setBadgeBackgroundColor: vi.fn(async (_color: string) => {}),
    setBadgeText: vi.fn(async (_text: string) => {}),
    setBadgeTextColor: vi.fn(async (_color: string) => {}),
  },
  downloads: {
    download: vi.fn(async () => {}),
  },
  tabs: {
    query: vi.fn(async (_queryInfo) => {
      return Promise.resolve([{ id: 1234 }]);
    }),
    create: vi.fn(async (_url) => {
      return Promise.resolve({ id: 1234 });
    }),
  },
};

export { chrome };
