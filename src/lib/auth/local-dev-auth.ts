import "server-only";

/**
 * Local one-click authentication is an explicit development-server capability.
 * Both conditions are required so setting the flag on a production process cannot
 * expose the provider accidentally.
 */
export function localDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.LOCAL_DEV_AUTH === "1";
}

export function localDevHostEmail() {
  return process.env.LOCAL_DEV_HOST_EMAIL || "elena@example.com";
}
