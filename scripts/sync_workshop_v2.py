#!/usr/bin/env python3
"""HEI Workshop Sync v2: API metadata, independently retained galleries, optional image mirroring.
Uses Steam API metadata and dedicated still-image list, preserves galleries on page errors.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
IDS_FILE = ROOT / "data/workshop-ids.json"
OLD_FILE = ROOT / "data/workshop.json"
DATA_FILE = ROOT / "data/workshop-v2.json"
REPORT_FILE = ROOT / "data/workshop-v2-report.json"
OVERRIDES_FILE = ROOT / "data/gallery-overrides.json"
CACHE_DIR = ROOT / "assets/workshop"
API = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/"
IMAGE_HOSTS = {"images.steamusercontent.com", "steamuserimages-a.akamaihd.net",
               "steamuserimages.akamaihd.net", "steamcommunity-a.akamaihd.net"}
MAX_IMAGE_BYTES = 5_000_000
MAX_IMAGES_PER_ITEM = 16
PAGE_REQUEST_GAP_SECONDS = 10  # Match the legacy sync's 10-second Workshop interval.
RATE_LIMIT_COOLDOWN_SECONDS = 3600  # Wait one hour after first Steam HTTP 429.
RATE_LIMIT_RETRY_INTERVAL_SECONDS = 3600  # One hour between recovery attempts.
RATE_LIMIT_RETRIES = 3  # Three recovery attempts, in addition to initial request.
MAX_RATE_LIMIT_WAIT_SECONDS = 5400  # Longer Retry-After allowed up to 90 minutes.
MAX_TOTAL_BACKOFF_SECONDS = 11700  # Bound waits to 3h15m within Actions timeout.

def load(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if not path.exists() or path.read_text(encoding="utf-8") != content:
        path.write_text(content, encoding="utf-8")

def valid_url(url):
    if not isinstance(url, str):
        return None
    url = url.strip()
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in IMAGE_HOSTS or parsed.username or parsed.password:
        return None
    return url if len(url) <= 2048 else None

def full_resolution_url(url):
    """Remove Steam's thumbnail-only image resize options; retain original image identity."""
    url = valid_url(url)
    if not url:
        return None
    parsed = urllib.parse.urlsplit(url)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    image_resize_keys = {"imw", "imh", "ima", "impolicy", "imcolor", "letterbox"}
    clean_query = urllib.parse.urlencode([(k, v) for k, v in query if k.lower() not in image_resize_keys])
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, clean_query, parsed.fragment))

def unique_images(values, preview=None):
    result = []
    for value in values or []:
        url = full_resolution_url(value)
        if url and url != full_resolution_url(preview) and url not in result:
            result.append(url)
    return result[:MAX_IMAGES_PER_ITEM]

def get_gallery(details):
    previews = details.get("previews")
    if not isinstance(previews, list):
        return []
    gallery = []
    for entry in sorted((p for p in previews if isinstance(p, dict)),
                        key=lambda p: int(p.get("sortorder") or 0)):
        if entry.get("preview_type", 0) not in (0, None):
            continue
        gallery.append(entry.get("url") or entry.get("preview_url"))
    return unique_images(gallery, details.get("preview_url"))

def fetch_metadata(ids):
    form = [("itemcount", str(len(ids))), ("includeadditionalpreviews", "1")]
    form += [("publishedfileids[%d]" % i, id_) for i, id_ in enumerate(ids)]
    req = urllib.request.Request(API, data=urllib.parse.urlencode(form).encode("ascii"),
                                 headers={"User-Agent": "HEI-Shipyards-Sync/4.0",
                                          "Accept": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.load(response)
    entries = data.get("response", {}).get("publishedfiledetails", [])
    return {str(entry.get("publishedfileid")): entry for entry in entries
            if isinstance(entry, dict) and entry.get("publishedfileid")}

def fetch_page_gallery(workshop_id, preview):
    """Extract only true still photos from Steam's dedicated screenshot list, not video posters."""
    url = "https://steamcommunity.com/sharedfiles/filedetails/?id=" + urllib.parse.quote(str(workshop_id))
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (compatible; HEI-Shipyards-Gallery/4.1)",
        "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(request, timeout=18) as response:
        page = response.read(3_000_001)
        if len(page) > 3_000_000:
            raise ValueError("Steam page exceeds HTML safety limit")
        content = page.decode("utf-8", "replace")
    match = re.search(r"var\s+rgFullScreenshotURLs\s*=\s*\[([\s\S]*?)\];", content)
    if not match:
        raise ValueError("Steam full screenshot list not found")
    # Steam supplies JavaScript object literals here, not strict JSON.
    values = re.findall(r"['\"]url['\"]\s*:\s*['\"](https://[^'\"]+)['\"]", match.group(1))
    return unique_images(values, preview)

def fetch_page_gallery_with_cooldown(workshop_id, preview):
    """Wait one hour on the first 429, then retry up to three times.

    Wait at least one hour between each subsequent recovery attempt.
    Preserve existing galleries if Steam keeps rate limiting; respect long
    Retry-After values without exceeding the configured workflow wait budget.
    """
    total_wait = 0
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        try:
            return fetch_page_gallery(workshop_id, preview)
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
            if attempt == RATE_LIMIT_RETRIES:
                print(f"WARNING: Steam HTTP 429 persisted after {RATE_LIMIT_RETRIES} recovery attempts "
                      f"for {workshop_id}; preserving saved gallery.",
                      file=sys.stderr, flush=True)
                raise
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            try:
                requested_wait = max(0, int(retry_after)) if retry_after is not None else 0
            except (TypeError, ValueError):
                requested_wait = 0
            wait = max(RATE_LIMIT_COOLDOWN_SECONDS if attempt == 0 else
                       RATE_LIMIT_RETRY_INTERVAL_SECONDS, requested_wait)
            if wait > MAX_RATE_LIMIT_WAIT_SECONDS or total_wait + wait > MAX_TOTAL_BACKOFF_SECONDS:
                print(f"WARNING: Steam cooldown exceeds safety budget for {workshop_id}; "
                      "preserving gallery for the next scheduled sync.",
                      file=sys.stderr, flush=True)
                raise
            total_wait += wait
            print(f"WARNING: Steam HTTP 429 on {workshop_id}; waiting {wait}s "
                  f"before recovery attempt {attempt + 1}/{RATE_LIMIT_RETRIES}.",
                  file=sys.stderr, flush=True)
            time.sleep(wait)

def image_extension(data):
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return None

def cache_image(workshop_id, url):
    """Mirror only recognized images from allowlisted Steam hosts; keep old assets on failures."""
    if not valid_url(url):
        raise ValueError("Unapproved image URL")
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    folder = CACHE_DIR / workshop_id
    for extension in (".jpg", ".png", ".webp"):
        stored = folder / (key + extension)
        if stored.is_file():
            return "/" + stored.relative_to(ROOT).as_posix()
    req = urllib.request.Request(url, headers={"User-Agent": "HEI-Shipyards-Sync/4.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        if not valid_url(response.geturl()):
            raise ValueError("Image redirected to an unapproved host")
        data = response.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds 5 MB limit")
    ext = image_extension(data)
    if not ext:
        raise ValueError("Response was not a supported image")
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (key + ext)
    target.write_bytes(data)
    return "/" + target.relative_to(ROOT).as_posix()

def normalized_previous(item, legacy):
    source = item if item else legacy
    return {
        "title": source.get("title", ""),
        "preview_url": full_resolution_url(source.get("preview_url")) or "",
        "gallery_urls": unique_images(source.get("gallery_urls", [])),
        "time_updated": source.get("time_updated"),
        "images": source.get("images", {}),
    }

def build_listing(cfg, previous, legacy, details, override, checked, mirror, allow_page_lookup=True):
    key = str(cfg["id"])
    prior = normalized_previous(previous or {}, legacy or {})
    valid = isinstance(details, dict) and details.get("result") == 1
    gallery = prior["gallery_urls"]
    source = "saved" if gallery else "missing"
    note = "Previously saved images; Steam has not confirmed a new gallery." if gallery else "No gallery images available."
    preview = prior["preview_url"]
    title = prior["title"]
    updated = prior["time_updated"]
    metadata_status = "preserved"
    page_rate_limited = False
    if valid:
        title = str(details.get("title") or title)
        preview = full_resolution_url(details.get("preview_url")) or preview
        updated = details.get("time_updated") or updated
        metadata_status = "verified"
        latest = get_gallery(details)
        if latest:
            gallery = latest
            source = "steam-api"
            note = "Current gallery returned by Steam API."
        elif gallery:
            note = "Steam API provided no gallery; previously saved images retained."
        else:
            note = "Steam API provided no gallery images."
        # Steam omits additional previews for many blueprints, not only Excalibur.
        # Read only its dedicated still-screenshot list (never video poster images).
        # A successfully parsed empty list is authoritative; errors keep saved photos.
        has_manual_gallery = isinstance(override, dict) and "images" in override
        if not latest and not has_manual_gallery:
            if allow_page_lookup:
                try:
                    gallery = fetch_page_gallery_with_cooldown(key, preview)
                    source = "steam-page"
                    note = ("Current still photos from Steam screenshot list." if gallery
                            else "Steam screenshot list confirms no additional still photos.")
                except urllib.error.HTTPError as err:
                    page_rate_limited = err.code == 429
                    note = "Steam page HTTP %s; previously saved pictures retained." % err.code
                except (OSError, ValueError, urllib.error.URLError) as err:
                    note = "Steam gallery check failed; previous pictures retained: " + str(err)[:100]
            else:
                note = "Steam page lookups paused after rate limiting; saved photos retained."
    manual = override.get("images") if isinstance(override, dict) else None
    if manual is not None:
        gallery = unique_images(manual, preview)
        source = "manual"
        note = ("Manual gallery selection: no additional still photos; the Workshop preview remains visible."
                if not gallery else "Explicitly supplied gallery image list.")
    previous_images = prior["images"] if isinstance(prior["images"], dict) else {}
    cached = {}
    errors = []
    for url in ([preview] if preview else []) + gallery:
        path = previous_images.get(url)
        if path and isinstance(path, str) and path.startswith("/assets/workshop/") and (ROOT / path.lstrip("/")).is_file():
            cached[url] = path
        elif mirror:
            try:
                cached[url] = cache_image(key, url)
            except (OSError, ValueError, urllib.error.URLError) as err:
                errors.append(str(err)[:180])
    return {
        "id": key, "route": cfg.get("route"), "category": cfg.get("category", "Other"),
        "title": title, "url": "https://steamcommunity.com/sharedfiles/filedetails/?id=" + key,
        "preview_url": preview, "gallery_urls": gallery, "time_updated": updated,
        "metadata_status": metadata_status, "gallery_source": source, "gallery_note": note,
        "gallery_page_rate_limited": page_rate_limited,
        "images": cached, "image_cache_status": ("complete" if len(cached) == len(set(([preview] if preview else []) + gallery))
                                               else "partial" if cached else "uncached"),
        "image_errors": errors[:3]
    }

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline-seed", action="store_true", help="Use saved data only; no network")
    parser.add_argument("--cache-images", action="store_true", help="Download approved Steam image files into assets/workshop")
    parser.add_argument("--only", help="Workshop ID to test; other entries are left unchanged")
    args = parser.parse_args(argv)
    configs = load(IDS_FILE, [])
    old = {str(x["id"]): x for x in load(OLD_FILE, [])}
    previous = {str(x["id"]): x for x in load(DATA_FILE, [])}
    overrides = load(OVERRIDES_FILE, {})
    selected = [c for c in configs if not args.only or str(c["id"]) == args.only]
    if not selected:
        parser.error("No configured Workshop item matched --only")
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    fetched = {}
    request_error = None
    if not args.offline_seed:
        try:
            fetched = fetch_metadata([str(c["id"]) for c in selected])
        except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            request_error = "%s: %s" % (type(exc).__name__, str(exc)[:200])
    output = dict(previous)
    statuses = []
    page_attempts = 0
    page_lookups_paused = False
    # Verify previously unrefreshed galleries first so rate limits cannot
    # consistently starve later-listed vessels on every daily sync.
    prioritized = sorted(configs, key=lambda c: (
        0 if previous.get(str(c["id"]), {}).get("gallery_source") in ("saved", "missing") else 1
    ))
    for c in prioritized:
        key = str(c["id"])
        if c not in selected and key in output:
            continue
        if c not in selected:
            # Bootstrap untouched items from legacy cache for an Excalibur-only test.
            output[key] = build_listing(c, {}, old.get(key), None, overrides.get(key, {}), now, False)
            continue
        detail = fetched.get(key)
        override = overrides.get(key, {})
        should_visit_page = (not args.offline_seed and not page_lookups_paused
                             and isinstance(detail, dict) and detail.get("result") == 1
                             and not get_gallery(detail)
                             and not (isinstance(override, dict) and "images" in override))
        if should_visit_page:
            if page_attempts:
                time.sleep(PAGE_REQUEST_GAP_SECONDS)
            page_attempts += 1
        listing = build_listing(c, previous.get(key, {}), old.get(key, {}), detail,
                                override, now, args.cache_images,
                                allow_page_lookup=not page_lookups_paused)
        if listing["gallery_page_rate_limited"]:
            page_lookups_paused = True
            print("WARNING: Steam returned HTTP 429; skipping remaining screenshot page requests.",
                  file=sys.stderr, flush=True)
        output[key] = listing
        statuses.append({"id": key, "title": listing["title"],
                         "metadata": listing["metadata_status"],
                         "gallery": listing["gallery_source"],
                         "gallery_count": len(listing["gallery_urls"]),
                         "page_rate_limited": listing["gallery_page_rate_limited"],
                         "cached_count": len(listing["images"]),
                         "cache_status": listing["image_cache_status"],
                         "errors": listing["image_errors"]})
    rows = [output[str(c["id"])] for c in configs if str(c["id"]) in output]
    save(DATA_FILE, rows)
    verified = sum(x["metadata"] == "verified" for x in statuses)
    overall = ("offline-seed" if args.offline_seed else
               "failed" if verified == 0 else
               "partial" if verified < len(statuses) or any(x["gallery"] == "saved" or x["cache_status"] == "partial" for x in statuses)
               else "complete")
    report = {"schema_version": 2, "checked_at": now, "status": overall,
              "mode": "offline-seed" if args.offline_seed else "live-api",
              "checked": len(statuses), "metadata_verified": verified,
              "gallery_from_api": sum(x["gallery"] == "steam-api" for x in statuses),
              "gallery_from_page": sum(x["gallery"] == "steam-page" for x in statuses),
              "page_lookups_paused": page_lookups_paused,
              "page_request_gap_seconds": PAGE_REQUEST_GAP_SECONDS,
              "rate_limit_cooldown_seconds": RATE_LIMIT_COOLDOWN_SECONDS,
              "rate_limit_retry_interval_seconds": RATE_LIMIT_RETRY_INTERVAL_SECONDS,
              "rate_limit_retries": RATE_LIMIT_RETRIES,
              "gallery_preserved": sum(x["gallery"] == "saved" for x in statuses),
              "image_cache_complete": sum(x["cache_status"] == "complete" for x in statuses),
              "request_error": request_error, "items": statuses}
    save(REPORT_FILE, report)
    print("HEI sync v2:", json.dumps({k: v for k, v in report.items() if k != "items"}))
    for entry in statuses:
        print("%s metadata=%s gallery=%s gallery_count=%d cached=%d" %
              (entry["id"], entry["metadata"], entry["gallery"], entry["gallery_count"], entry["cached_count"]))
    # A failed Steam request is a real failure, even though existing data was preserved.
    return 2 if not args.offline_seed and verified == 0 else 0

if __name__ == "__main__":
    sys.exit(main())
