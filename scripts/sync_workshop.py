#!/usr/bin/env python3
"""Refresh known HEI Steam Workshop listing metadata without touching custom site content."""
import json, os, pathlib, sys, urllib.parse, urllib.request
BASE=pathlib.Path(__file__).resolve().parents[1]
ids=json.loads((BASE/"data/workshop-ids.json").read_text())
if not ids:
    raise SystemExit("No Workshop IDs configured; refusing to replace inventory.")
data=urllib.parse.urlencode(
    [("itemcount",len(ids)),("includeadditionalpreviews","1")]+[(f"publishedfileids[{i}]",str(v["id"])) for i,v in enumerate(ids)]
).encode()
req=urllib.request.Request(
 "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/",
 data=data,headers={"User-Agent":"HEI-Shipyards-Workshop-Sync/1.0"},method="POST")
with urllib.request.urlopen(req,timeout=30) as r:
    response=json.load(r)
details=response.get("response",{}).get("publishedfiledetails",[])
by_id={str(x.get("publishedfileid")):x for x in details}
out=[]
errors=[]
for v in ids:
    key=str(v["id"])
    d=by_id.get(key)
    if not d or d.get("result")!=1:
        errors.append(key)
        continue
    title=d.get("title","")
    if "(discontinued)" in title.lower():
        continue
    previews=sorted(d.get("previews") or [],key=lambda p:p.get("sortorder",0))
    gallery=[]
    for p in previews:
        link=p.get("url") or p.get("preview_url")
        if not isinstance(link,str) or not link.startswith("https://"):
            continue
        if p.get("preview_type",0) not in (0,None):
            continue
        if link==d.get("preview_url") or link in gallery:
            continue
        gallery.append(link)
    out.append({
        "id":key,"title":title,
        "description":d.get("file_description",""),
        "preview_url":d.get("preview_url",""),
        "gallery_urls":gallery,
        "time_updated":d.get("time_updated"),
        "url":f"https://steamcommunity.com/sharedfiles/filedetails/?id={key}",
        "category":v.get("category","Other"),"route":v.get("route")
    })
if errors:
    raise SystemExit("Steam did not return valid results for: "+", ".join(errors)+"; existing output preserved.")
if not out:
    raise SystemExit("All entries excluded or empty; existing output preserved.")
path=BASE/"data/workshop.json"
new=json.dumps(out,ensure_ascii=False,indent=2)+"\n"
if not path.exists() or path.read_text()!=new:
    path.write_text(new)
print(f"Synced {len(out)} Workshop entries; custom content untouched.")
