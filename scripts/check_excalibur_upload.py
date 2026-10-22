#!/usr/bin/env python3
"""Read-only Excalibur upload check. Never updates files or retries Steam requests."""
import json
import urllib.error
import urllib.request
from scripts.sync_workshop_v2 import fetch_metadata, get_gallery

WORKSHOP_ID = "3718140217"
URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=" + WORKSHOP_ID

def main():
    try:
        details = fetch_metadata([WORKSHOP_ID]).get(WORKSHOP_ID)
    except Exception as exc:
        print("STEAM_API_ERROR",type(exc).__name__,str(exc)[:180])
        return 1
    if not details:
        print("STEAM_API_NO_LISTING")
        return 1
    previews = details.get("previews") or []
    gallery = get_gallery(details)
    print("EXCALIBUR_METADATA",json.dumps({
        "result":details.get("result"),
        "title":details.get("title"),
        "time_updated":details.get("time_updated"),
        "preview_url":details.get("preview_url"),
        "previews_raw_count":len(previews),
        "gallery_count":len(gallery),
        "gallery_urls":gallery,
    },ensure_ascii=False))
    request=urllib.request.Request(URL,headers={"User-Agent":"Mozilla/5.0 (compatible; HEI Workshop Preview Diagnostic)","Accept-Language":"en-US,en;q=0.9"})
    try:
        with urllib.request.urlopen(request,timeout=15) as response:
            page=response.read(3_000_000).decode("utf-8","replace")
            print("STEAM_PAGE_HTTP",response.status,"html_bytes",len(page))
            # Parse locally. Importing the legacy sync script would execute a full sync.
            from html.parser import HTMLParser
            class CandidateImages(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.gallery=[]
                def handle_starttag(self,tag,attrs):
                    if tag != "img":return
                    props=dict(attrs)
                    for name in ("data-full","data-src","src"):
                        url=props.get(name,"")
                        if "steamusercontent.com" in url and url not in self.gallery:
                            self.gallery.append(url)
            parser=CandidateImages()
            parser.feed(page)
            print("STEAM_PAGE_IMAGE_CANDIDATES",json.dumps(parser.gallery[:25]))
    except urllib.error.HTTPError as exc:
        print("STEAM_PAGE_HTTP",exc.code,"retry_after",exc.headers.get("Retry-After"))
    except Exception as exc:
        print("STEAM_PAGE_ERROR",type(exc).__name__,str(exc)[:180])
    return 0

if __name__=="__main__":
    raise SystemExit(main())
