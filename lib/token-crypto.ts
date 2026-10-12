// Service sign-ins (Xbox, PlayStation) are sealed with AES-GCM and bound to their connection ID, so a ciphertext copied to another row will not open.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function bytes(value: string) { return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)); }

async function importKey(secret: string) {
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = bytes(secret); } catch { throw new Error("The token key must be base64."); }
  if (raw.length !== 32) throw new Error("The token key must be 32 bytes of base64.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealToken(value: unknown, secret: string, connectionId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(connectionId) }, await importKey(secret), encoder.encode(JSON.stringify(value)));
  return `v1.${base64(iv)}.${base64(new Uint8Array(sealed))}`;
}

export async function openToken<T>(cipher: string, secret: string, connectionId: string): Promise<T> {
  const [version, iv, data] = cipher.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Unknown token format.");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(iv), additionalData: encoder.encode(connectionId) }, await importKey(secret), bytes(data));
  return JSON.parse(decoder.decode(plain)) as T;
}
