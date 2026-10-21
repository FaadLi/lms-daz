const actions = [
  "parent",
  "media-urls",
  "issue-link",
  "finish-upload",
  "delete-media",
  "cleanup-media",
] as const;
const stages = [
  "cors",
  "request",
  "token",
  "auth",
  "rate-limit",
  "rpc",
  "signed-read",
  "metadata",
  "storage-read",
  "image-validation",
  "cleanup",
  "cleanup-pending",
  "delete-media",
] as const;
export type RequestStage = (typeof stages)[number];

// Explicit projection: never serialize a request, response body, or thrown error.
export function requestLog(
  action: unknown,
  stage: RequestStage,
  status: number,
) {
  return JSON.stringify({
    action: actions.includes(action as (typeof actions)[number])
      ? action
      : "unknown",
    stage: stages.includes(stage) ? stage : "request",
    status:
      Number.isInteger(status) && status >= 100 && status <= 599 ? status : 500,
  });
}
