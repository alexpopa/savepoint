export const steamOpenIdEndpoint = "https://steamcommunity.com/openid/login";
const namespace = "http://specs.openid.net/auth/2.0";
export const steamLinkLifetime = 10 * 60 * 1000;

export function steamLoginUrl(returnTo: string) {
  const url = new URL(steamOpenIdEndpoint);
  const identifier = "http://specs.openid.net/auth/2.0/identifier_select";
  url.search = new URLSearchParams({ "openid.ns": namespace, "openid.mode": "checkid_setup", "openid.return_to": returnTo,
    "openid.realm": new URL(returnTo).origin + "/", "openid.identity": identifier, "openid.claimed_id": identifier }).toString();
  return url.toString();
}

// Steam is the only trusted provider and only claims its own numeric identifiers.
// Pin both the provider and identifier namespace; never discover a caller-supplied URL.
export function steamAssertionFailure(params: URLSearchParams, returnTo: string, now = Date.now()): string | null {
  for (const key of params.keys()) if (params.getAll(key).length !== 1) return "duplicate_parameters";
  if (params.get("openid.ns") !== namespace) return "namespace";
  if (params.get("openid.mode") !== "id_res") return "response_mode";
  if (params.get("openid.op_endpoint") !== steamOpenIdEndpoint) return "provider";
  if (params.get("openid.return_to") !== returnTo) return "signed_return_url";
  const identity = params.get("openid.claimed_id") ?? "";
  if (!/^https:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/.test(identity)) return "identity_format";
  if (params.get("openid.identity") !== identity) return "identity_mismatch";
  const signed = new Set((params.get("openid.signed") ?? "").split(","));
  for (const field of ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"])
    if (!signed.has(field) || !params.get(`openid.${field}`)) return "unsigned_fields";
  if (!params.get("openid.sig")) return "missing_signature";
  const nonce = params.get("openid.response_nonce") ?? "";
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ.+$/.test(nonce)) return "nonce_format";
  const timestamp = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(timestamp) || timestamp > now + 60000 || now - timestamp > steamLinkLifetime) return "nonce_time";
  return null;
}

export function steamAssertion(params: URLSearchParams, returnTo: string, now = Date.now()) {
  if (steamAssertionFailure(params, returnTo, now)) return null;
  return params.get("openid.claimed_id")!.split("/").at(-1)!;
}

export async function verifySteamAssertion(params: URLSearchParams, returnTo: string, send: typeof fetch = fetch) {
  const steamId = steamAssertion(params, returnTo);
  if (!steamId) return null;
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith("openid.")) body.set(key, value);
  body.set("openid.mode", "check_authentication");
  // Workers supports manual redirect handling; a redirect is rejected by the status check below.
  const response = await send(steamOpenIdEndpoint, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const lines = (await response.text()).split("\n");
  return lines.filter((line) => line.startsWith("is_valid:")).length === 1 && lines.includes("is_valid:true") && lines.includes(`ns:${namespace}`) ? steamId : null;
}
