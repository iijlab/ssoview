/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export const createLabeledDebugLogger = createLabeledLogger.bind(null, console.debug);

export async function createLabeledLogger(
  logger: typeof console.log,
  labels: string[],
): Promise<typeof console.log> {
  if (labels.length === 0) {
    return logger;
  }

  const format = labels.map((label) => `%c${label}%c`).join(" ");
  const bgColors = await Promise.all(labels.map(mapDarkColor));
  const styles = bgColors.map(
    (bgColor) => `padding:4px; border-radius:4px; color: white; background-color: ${bgColor};`,
  );
  return logger.bind(null, format, ...styles.flatMap((style) => [style, ""]));
}

async function mapDarkColor(str: string): Promise<string> {
  return mapColor(str, 0x00, 0x9f);
}

async function mapColor(str: string, min: number, max: number): Promise<string> {
  const hashes = [
    await computeHash(str + "red"),
    await computeHash(str + "green"),
    await computeHash(str + "blue"),
  ];
  const rgb = hashes
    .map((hash) => (hash % (max - min + 1)) + min)
    .map((scaledHash) => scaledHash.toString(16).padStart(2, "0"));
  return `#${rgb.join("")}`;
}

async function computeHash(str: string): Promise<number> {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashNumbers = Array.from(new Uint8Array(hashBuffer));

  // Use first 6 bytes to stay within JavaScript's 53-bit safe integer range
  return hashNumbers.slice(0, 6).reduce((acc, byte, i) => acc + byte * Math.pow(256, 5 - i), 0);
}
