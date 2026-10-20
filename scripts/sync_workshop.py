#!/usr/bin/env python3
"""Sync HEI Workshop metadata and galleries conservatively; preserve custom site pages."""
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASE = pathlib.Path(__file__).resolve().parents[1]
IDS = json.loads((BASE / "data/workshop-ids.json").read_text())
OUTPUT = BASE / "data/workshop.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HEI-Shipyards-Workshop-Sync/3.0)",
           "Accept-Language": "en-US,en;q=0.9"}
IMAGE_HOSTS = ("steamusercontent.com", "steamuserimages-a.akamaihd.net",
               "steamuserimages.akamaihd.net", "steamcommunity-a.akamaihd.net")
REQUEST_GAP = 5
BLUEPRINT_GAP = 10
RETRY_WAIT = 30
MAX_ATTEMPTS = 3

def valid_image(value):
    if not isinstance(value, str):
        return None
    value = html.unescape(value).replace("\\/", "/").strip()
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "https" or not any(
        parsed.hostname == h or (parsed.hostname or "").endswith("." + h)
        for h in IMAGE_HOSTS
    ):
        return None
    return value

class SteamScreenshotParser(HTMLParser):
    """Extract screenshots from Steam highlight strip, excluding unrelated images."""
    def __init__(self):
        super().__init__()
        self.gallery = []
        self.in_strip = 0

    def add(self, url):
        url = valid_image(url)
        if url and url not in self.gallery:
            self.gallery.append(url)

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        classes = d.get("class", "")
        if tag == "div" and self.in_strip:
            self.in_strip += 1
        elif tag == "div" and ("highlight_strip" in classes or "workshopItemPreviewImage" in classes):
            self.in_strip = 1
        if self.in_strip:
            if tag == "img":
                self.add(d.get("data-full") or d.get("data-src") or d.get("src"))
            if tag == "a":
                for field in ("href", "onclick", "data-url"):
                    for match in re.findall(r"https://[^\\s\\\"'<>);]+", d.get(field, "")):
                        self.add(match)

    def handle_endtag(self, tag):
        if tag == "div" and self.in_strip:
            self.in_strip -= 1

def request_json(workshop_id):
    payload = urllib.parse.urlencode([
        ("itemcount", 1), ("includeadditionalpreviews", "1"),
        ("publishedfileids[0]", str(workshop_id))
    ]).encode()
    req = urllib.request.Request(
        "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
        data=payload, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req, timeout=30) as response:
        data = json.load(response)
    items = data.get("response", {}).get("publishedfiledetails", [])
    if not items or items[0].get("result") != 1:
        raise ValueError("Steam returned no valid listing")
    return items[0]

def page_gallery(workshop_id, preview):
    url = "https://steamcommunity.com/sharedfiles/filedetails/?id=" + urllib.parse.quote(str(workshop_id))
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as response:
        page = response.read(4_000_000).decode("utf-8", "replace")
    parser = SteamScreenshotParser()
    parser.feed(page)
    for match in re.finditer(r"ShowImage\(\s*['\"](https://[^'\"]+)", html.unescape(page)):
        parser.add(match.group(1))
    return [x for x in parser.gallery if x != preview]

def api_gallery(details):
    gallery = []
    previews = sorted(details.get("previews") or [], key=lambda p: p.get("sortorder", 0))
    for p in previews:
        if p.get("preview_type", 0) not in (0, None):
            continue
        url = valid_image(p.get("url") or p.get("preview_url"))
        if url and url != details.get("preview_url") and url not in gallery:
            gallery.append(url)
    return gallery

def with_retries(label, operation):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as exc:
            print(f"WARNING: {label} attempt {attempt}/{MAX_ATTEMPTS} failed: {exc}", file=sys.stderr, flush=True)
            if attempt < MAX_ATTEMPTS:
                time.sleep(RETRY_WAIT)
    return None

def keep_valid_gallery(item, preview):
    return [url for url in (valid_image(u) for u in item.get("gallery_urls", []))
            if url and url != preview]

def save(items):
    if not items:
        return
    content = json.dumps(items, ensure_ascii=False, indent=2) + "\n"
    if not OUTPUT.exists() or OUTPUT.read_text() != content:
        OUTPUT.write_text(content)

if not IDS:
    raise SystemExit("No Workshop IDs configured; existing data preserved.")

previous = {}
if OUTPUT.exists():
    try:
        previous = {str(item["id"]): item for item in json.loads(OUTPUT.read_text())}
    except (ValueError, TypeError, KeyError) as exc:
        print(f"WARNING: Existing data couldn't be parsed: {exc}", file=sys.stderr)

# Preserve existing entries while refreshing. Never remove a valid entry just because Steam failed.
current = dict(previous)
for position, item in enumerate(IDS):
    if position:
        time.sleep(BLUEPRINT_GAP)
    key = str(item["id"])
    prior = previous.get(key, {})
    print(f"Refreshing {position + 1}/{len(IDS)}: {key}", flush=True)
    details = with_retries(f"{key} metadata", lambda: request_json(key))
    if details is None:
        print(f"WARNING: Keeping previously saved {key} data", file=sys.stderr)
        continue
    title = details.get("title", "")
    if "(discontinued)" in title.lower():
        current.pop(key, None)
        save(list(current.values()))
        continue
    preview = valid_image(details.get("preview_url")) or prior.get("preview_url", "")
    old_gallery = keep_valid_gallery(prior, preview)
    gallery = api_gallery(details)
    updated = details.get("time_updated")

    # Steam can replace screenshots without changing the blueprint's update timestamp.
    # Excalibur must refresh the screenshot page even when cached gallery data exists.
    # Other ships retain the previous conservative cache behavior.
    refresh_page = key == "3718140217" or (not gallery and not old_gallery)
    if refresh_page:
        time.sleep(REQUEST_GAP)
        page_images = with_retries(f"{key} screenshot page",
                                  lambda: page_gallery(key, preview))
        if page_images:
            gallery = page_images
    elif not gallery and old_gallery:
        gallery = old_gallery

    # Preserve saved screenshots when Steam's API or page scrape is incomplete.
    # An updated gallery is accepted when it has a trustworthy full replacement.
    if old_gallery and not gallery:
        gallery = old_gallery
    elif old_gallery and len(gallery) < len(old_gallery):
        print(f"WARNING: {key} returned {len(gallery)} images versus {len(old_gallery)} saved; retaining saved gallery", file=sys.stderr)
        gallery = old_gallery
    print(f"Gallery {key}: API={len(api_gallery(details))}, active={len(gallery)}, saved={len(old_gallery)}", flush=True)

    current[key] = {
        "id": key, "title": title, "description": details.get("file_description", ""),
        "preview_url": preview, "gallery_urls": gallery,
        "time_updated": updated,
        "url": f"https://steamcommunity.com/sharedfiles/filedetails/?id={key}",
        "category": item.get("category", "Other"), "route": item.get("route")
    }
    save(list(current.values()))  # checkpoint after each blueprint; never leave an empty fleet

configured = {str(item["id"]) for item in IDS}
current = {key: value for key, value in current.items() if key in configured}
save(list(current.values()))
filled = sum(bool(item.get("gallery_urls")) for item in current.values())
print(f"Synced/checkpointed {len(current)} blueprints; {filled} screenshot galleries populated.", flush=True)
