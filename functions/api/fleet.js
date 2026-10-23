import {authorize, respond, loadFleet, saveFleet, validMediaUrl, errorResult} from "../_lib/secure.js";
export async function onRequestGet({request, env}) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  try {
    const {items, sha} = await loadFleet(env);
    return respond({items, version: sha});
  } catch (err) { return errorResult(err); }
}
export async function onRequestPut({request, env}) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") || 0) > 20000)
    return respond({error: "Request too large."}, 413);
  let input;
  try {input = await request.json();} catch (_) {return respond({error: "Invalid JSON."}, 400);}
  if (!input || typeof input !== "object" || !/^\d{8,12}$/.test(String(input.id)) ||
      typeof input.version !== "string" || !/^[0-9a-f]{40}$/.test(input.version))
    return respond({error: "Invalid vessel or version."}, 400);
  const value = input.changes || {};
  const title = value.title, description = value.description;
  const category = value.category, cover = value.preview_url, gallery = value.gallery_urls;
  if (typeof title !== "string" || !title.trim() || title.length > 160 ||
      typeof description !== "string" || description.length > 4000 ||
      !["Combat","Civilian","Industrial","Infrastructure","Other"].includes(category) ||
      !Array.isArray(gallery) || gallery.length > 16 ||
      gallery.some(u => !validMediaUrl(u)) ||
      !(cover === "" || validMediaUrl(cover)))
    return respond({error: "Invalid details, images, or gallery size."}, 400);
  try {
    const {items, sha} = await loadFleet(env);
    if (sha !== input.version)
      return respond({error: "Fleet data changed since you opened the editor. Reload before publishing."}, 409);
    const item = items.find(x => String(x.id) === String(input.id));
    if (!item) return respond({error: "Vessel was not found in fleet registry."}, 404);
    item.title = title.trim();
    item.description = description.trim();
    item.category = category;
    item.preview_url = cover;
    item.gallery_urls = [...new Set(gallery.filter(u => u !== cover))];
    item.gallery_source = "manual";
    item.gallery_note = "Manually curated in HEI Fleet Manager.";
    item.manual_updated_at = new Date().toISOString();
    // Keep Steam Workshop URL, route, technical record, legacy image cache and IDs intact.
    await saveFleet(env, items, sha, item.title);
    const fresh = await loadFleet(env);
    return respond({ok: true, version: fresh.sha, item: fresh.items.find(x => String(x.id) === String(input.id))});
  } catch (err) { return errorResult(err); }
}
