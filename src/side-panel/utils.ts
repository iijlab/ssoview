/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

// react
import { type EffectCallback, useEffect } from "react";

const formatRFC3339Date = (d: Date) => {
  if (isNaN(d.valueOf())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  const sec = String(d.getSeconds()).padStart(2, "0");

  let offset = d.getTimezoneOffset(); // JST: -540
  if (isNaN(offset)) {
    offset = 0;
  }
  const tzSign = Math.sign(offset) > 0 ? "-" : "+";
  offset = Math.abs(offset);
  const tzHour = String(Math.floor(offset / 60)).padStart(2, "0");
  const tzMinute = String(offset % 60).padStart(2, "0");

  return `${year}-${month}-${date}T${hour}:${minute}:${sec}${tzSign}${tzHour}:${tzMinute}`;
};

const formatRFC3339 = (date: Date | string) => {
  if (typeof date === "string") {
    return formatRFC3339Date(new Date(date));
  }
  return formatRFC3339Date(date);
};

const timestamp = () => {
  const ts = new Date().toISOString();
  return ts.slice(0, -5) + "Z";
};

// Run once when initialized
// - https://react.dev/reference/react/useEffect#my-effect-runs-twice-when-the-component-mounts
const useEffectOnce = (effect: EffectCallback) => {
  useEffect(effect, []); // eslint-disable-line react-hooks/exhaustive-deps
};

export { formatRFC3339, timestamp, useEffectOnce };
