import type { APIResponseError } from "@notionhq/client/build/src/errors.d.ts";
import { log } from "console";

export function isNotionAPIResponseError(
  error: unknown
): error is APIResponseError {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    "status" in error
  );
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  operation: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      retries > 0 &&
      isNotionAPIResponseError(error) &&
      error.code === "conflict_error"
    ) {
      log(`Retrying operation after ${delay}ms... (${retries} attempts left)`);
      await wait(delay);
      return retry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}
