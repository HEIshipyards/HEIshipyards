import {authorize, respond, loadFleet, saveImage, errorResult} from "../_lib/secure.js";
function imageExtension(raw) {
  if (raw.length >= 8 && raw[0] === 137 && raw[1] === 80 && raw[2] === 78 &&
      raw[3] === 71 && raw[4] === 13 && raw[5] === 10 && raw[6] === 26 && raw[7] === 10) return "png";
  if (raw.length >= 3 && raw[0] === 255 && raw[1] === 216 && raw[2] === 255) return "jpg";
  if (raw.length >= 12 && String.fromCharCode(...raw.slice(0,4)) === "RIFF" &&
      String.fromCharCode(...raw.slice(8,12)) === "WEBP") return "webp";
  return null;
}
export async function onRequestPost({request, env}) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") || 0) > 5_300_000)
    return respond({error: "Image too large (3.5 MB maximum)."}, 413);
  let data;
  try {data = await request.json();} catch (_) {return respond({error: "Invalid image request."}, 400);}
  if (!data || !/^\d{8,12}$/.test(String(data.id)) ||
      typeof data.base64 !== "string" || data.base64.length > 4_800_000 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))
    return respond({error: "Invalid image or vessel ID."}, 400);
  try {
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    if (bytes.length < 100 || bytes.length > 3_500_000)
      return respond({error: "Image size must be under 3.5 MB."}, 413);
    const ext = imageExtension(bytes);
    if (!ext) return respond({error: "Only PNG, JPEG and WebP images are supported."}, 415);
    const {items} = await loadFleet(env);
    if (!items.some(item => String(item.id) === String(data.id)))
      return respond({error: "Unknown vessel ID."}, 404);
    const path = "assets/fleet/" + data.id + "/" + crypto.randomUUID().replace(/-/g, "") + "." + ext;
    await saveImage(env, path, data.base64, String(data.id));
    return respond({url: "/" + path});
  } catch (err) { return errorResult(err); }
}
