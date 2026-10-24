import {authorize, respond, loadShipPages, saveShipPages, errorResult} from "../_lib/secure.js";

export async function onRequestGet({request, env}) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  try {
    const {items, sha} = await loadShipPages(env);
    return respond({items, version: sha});
  } catch (error) { return errorResult(error); }
}

export async function onRequestPut({request, env}) {
  const denied = await authorize(request, env);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") || 0) > 180000)
    return respond({error: "Request too large."}, 413);
  let payload;
  try { payload = await request.json(); }
  catch (_) { return respond({error: "Invalid JSON."}, 400); }
  const route = payload?.route;
  const data = payload?.page;
  if (typeof route !== "string" ||
      !/^(?:ship-[a-z0-9-]{2,80}|workshop-\d{8,12})$/.test(route) ||
      typeof payload.version !== "string" || !/^[a-f0-9]{40}$/.test(payload.version) ||
      !data || typeof data !== "object" || Array.isArray(data))
    return respond({error: "Invalid ship-page request."}, 400);
  const specs = data.specs;
  const lore = data.lore;
  if (!Array.isArray(specs) || specs.length > 35 ||
      specs.some(x => !Array.isArray(x) || x.length !== 2 ||
        typeof x[0] !== "string" || !x[0].trim() || x[0].length > 100 ||
        typeof x[1] !== "string" || x[1].length > 2000) ||
      !lore || typeof lore !== "object" || Array.isArray(lore) ||
      typeof lore.intro !== "string" || lore.intro.length > 6000 ||
      !Array.isArray(lore.sections) || lore.sections.length > 30 ||
      (lore.html !== undefined && (typeof lore.html !== "string" || lore.html.length > 60000 || /<\s*\/?\s*(?:script|style|iframe|svg|math|object|embed|form)\b/i.test(lore.html) || /<[^>]+\s+[a-z-]+\s*=/i.test(lore.html) || /<\/?(?!p\b|div\b|h2\b|h3\b|b\b|strong\b|i\b|em\b|ul\b|ol\b|li\b|br\b|span\b)[^>]*>/i.test(lore.html))) || 
      lore.sections.some(x => !Array.isArray(x) || x.length !== 2 ||
        typeof x[0] !== "string" || !x[0].trim() || x[0].length > 150 ||
        typeof x[1] !== "string" || x[1].length > 6000))
    return respond({error: "Check technical specifications and lore fields."}, 400);
  try {
    const {items, sha} = await loadShipPages(env);
    if (sha !== payload.version)
      return respond({error: "Ship pages changed since you opened the editor. Refresh before publishing."}, 409);
    items[route] = {
      specs: specs.map(([key, value]) => [key.trim(), value.trim()]),
      lore: {intro: lore.intro.trim(),
        sections: lore.sections.map(([heading, body]) => [heading.trim(), body.trim()]), 
        ...(typeof lore.html === "string" ? {html: lore.html.trim()} : {})}
    };
    await saveShipPages(env, items, sha, route);
    const fresh = await loadShipPages(env);
    return respond({ok: true, version: fresh.sha, page: fresh.items[route]});
  } catch (error) { return errorResult(error); }
}
