#!/usr/bin/env python3
"""Sync HEI Workshop metadata and screenshot galleries; never edit custom site pages."""
import html
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

BASE = pathlib.Path(__file__).resolve().parents[1]
IDS = json.loads((BASE / "data/workshop-ids.json").read_text())
OUTPUT = BASE / "data/workshop.json"
if not IDS:
    raise SystemExit("No Workshop IDs configured; preserving existing data.")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; HEI-Shipyards-Workshop-Sync/2.0)",
    "Accept-Language": "en-US,en;q=0.9",
}
IMAGE_HOSTS = ("steamusercontent.com", "steamuserimages-a.akamaihd.net",
               "steamuserimages.akamaihd.net", "steamcommunity-a.akamaihd.net")


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
    """Extract actual screenshot links, not avatars, icons or Workshop thumbnails."""
    def __init__(self):
        super().__init__()
        self.gallery = []
        self.in_strip = 0
        self.main_photo = None

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
        if tag == "img" and d.get("id") == "previewImageMain":
            self.main_photo = valid_image(d.get("src"))
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


def page_gallery(workshop_id, preview):
    url = "https://steamcommunity.com/sharedfiles/filedetails/?id=" + urllib.parse.quote(str(workshop_id))
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        page = response.read(4_000_000).decode("utf-8", "replace")
    parser = SteamScreenshotParser()
    parser.feed(page)
    # Steam frequently places full-resolution images in ShowImage() calls.
    for match in re.finditer(r"ShowImage\\(\\s*['\\\"](https://[^'\\\"]+)", html.unescape(page)):
        parser.add(match.group(1))
    return [x for x in parser.gallery if x != preview]


def api_gallery(details):
    gallery = []
    previews = sorted(details.get("previews") or [], key=lambda p: p.get("sortorder", 0))
    for p in previews:
        if p.get("preview_type", 0) not in (0, None):
            continue
        link = valid_image(p.get("url") or p.get("preview_url"))
        if link and link != details.get("preview_url") and link not in gallery:
            gallery.append(link)
    return gallery


payload = urllib.parse.urlencode(
    [("itemcount", len(IDS)), ("includeadditionalpreviews", "1")]
    + [(f"publishedfileids[{i}]", str(v["id"])) for i, v in enumerate(IDS)]
).encode()
request = urllib.request.Request(
    "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
    data=payload, headers=HEADERS, method="POST")
with urllib.request.urlopen(request, timeout=30) as response:
    result = json.load(response)
by_id = {
    str(item.get("publishedfileid")): item
    for item in result.get("response", {}).get("publishedfiledetails", [])
}
previous = {}
if OUTPUT.exists():
    try:
        previous = {str(item["id"]): item for item in json.loads(OUTPUT.read_text())}
    except (ValueError, KeyError, TypeError) as exc:
        print(f"WARNING: Could not parse previous gallery data: {exc}", file=sys.stderr)

out, errors, missing = [], [], []
for item in IDS:
    key = str(item["id"])
    d = by_id.get(key)
    if not d or d.get("result") != 1:
        errors.append(key)
        continue
    title = d.get("title", "")
    if "(discontinued)" in title.lower():
        continue
    preview = d.get("preview_url", "")
    gallery = api_gallery(d)
    if not gallery:
        try:
            gallery = page_gallery(key, preview)
        except Exception as exc:
            print(f"WARNING: Workshop {key} screenshot page unavailable: {exc}", file=sys.stderr)
    if not gallery:
        gallery = [valid_image(url) for url in previous.get(key, {}).get("gallery_urls", [])]
        gallery = [url for url in gallery if url and url != preview]
    if not gallery:
        missing.append(key)
    out.append({
        "id": key, "title": title, "description": d.get("file_description", ""),
        "preview_url": preview, "gallery_urls": gallery,
        "time_updated": d.get("time_updated"),
        "url": f"https://steamcommunity.com/sharedfiles/filedetails/?id={key}",
        "category": item.get("category", "Other"), "route": item.get("route")
    })

if errors:
    raise SystemExit("Steam metadata unavailable for: " + ", ".join(errors) + "; existing output preserved.")
if not out:
    raise SystemExit("No usable listings; existing output preserved.")
images = sum(bool(x["gallery_urls"]) for x in out)
print(f"Steam image galleries: {images}/{len(out)} listings populated.")
if missing:
    print("WARNING: Screenshot gallery missing for: " + ", ".join(missing), file=sys.stderr)
if not images:
    raise SystemExit("ERROR: All Workshop screenshot galleries are empty. Existing data preserved; investigate Steam API/page access.")

updated = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
if not OUTPUT.exists() or OUTPUT.read_text() != updated:
    OUTPUT.write_text(updated)
print(f"Synced {len(out)} Workshop entries; custom content untouched.")
