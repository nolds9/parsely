import type { APIResponseError } from "@notionhq/client/build/src/errors.d.ts";

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
