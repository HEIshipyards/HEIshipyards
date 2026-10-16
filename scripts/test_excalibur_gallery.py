#!/usr/bin/env python3
"""One-item, read-only diagnostic for HEI Excalibur Steam gallery (no fleet writes)."""
import json
import urllib.error
import urllib.parse
import urllib.request

ID = "3718140217"
URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=" + ID
UA = {"User-Agent": "Mozilla/5.0 (HEI Shipyards gallery diagnostic)", "Accept-Language": "en-US,en;q=0.9"}
body = urllib.parse.urlencode({"itemcount":"1", "publishedfileids[0]":ID, "includeadditionalpreviews":"1"}).encode()
req = urllib.request.Request("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",data=body,headers=UA)
try:
    with urllib.request.urlopen(req,timeout=25) as res:
        data=json.load(res)["response"]["publishedfiledetails"][0]
    previews=data.get("previews") or []
    print(f"Excalibur {ID}: metadata response={data.get('result')}; API gallery entries={len(previews)}")
    for i,p in enumerate(previews):
        print(f" API preview {i+1}: {p.get('url') or p.get('preview_url')}")
except Exception as exc:
    print(f"API diagnostic failed: {exc}")
    raise SystemExit(1)

print("Testing one public Workshop page only. No retries after rate limiting.")
try:
    from html.parser import HTMLParser
    class Photos(HTMLParser):
        def __init__(self):
            super().__init__()
            self.photos=[]
        def handle_starttag(self,tag,attrs):
            if tag != "img": return
            d=dict(attrs)
            for field in ("data-full","data-src","src"):
                url=d.get(field,"")
                if "steamusercontent.com" in url and url not in self.photos:self.photos.append(url)
    with urllib.request.urlopen(urllib.request.Request(URL, headers=UA),timeout=25) as res:
        page=res.read(4_000_000).decode("utf-8","replace")
    parser=Photos();parser.feed(page)
    print(f"Public Workshop page loaded; {len(parser.photos)} candidate Steam images.")
    for url in parser.photos[:20]:print(" Candidate:",url)
except urllib.error.HTTPError as exc:
    print(f"Public Workshop page HTTP {exc.code}; Retry-After={exc.headers.get('Retry-After','not provided')}. No retry attempted.")
except Exception as exc:
    print(f"Public Workshop page failed: {type(exc).__name__}: {exc}")
print("Diagnostic finished. No data/workshop.json or vessel page changes.")
