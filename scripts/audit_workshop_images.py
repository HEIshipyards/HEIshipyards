#!/usr/bin/env python3
"""Check intrinsic dimensions of cached HEI Workshop images using Python stdlib."""
import json
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
def dimensions(path):
    blob = path.read_bytes()
    if blob.startswith(b"\x89PNG\r\n\x1a\n") and len(blob) > 24:
        return struct.unpack(">II", blob[16:24])
    if blob.startswith(b"\xff\xd8"):
        i=2
        while i < len(blob)-9:
            if blob[i] != 255:
                i += 1
                continue
            while i < len(blob) and blob[i] == 255:
                i += 1
            if i >= len(blob): break
            marker=blob[i];i+=1
            if marker in (0xD8,0xD9,0x01) or 0xD0<=marker<=0xD7:
                continue
            if i+2 > len(blob): break
            n=struct.unpack(">H",blob[i:i+2])[0]
            if n<2 or i+n>len(blob): break
            if marker in (0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF) and n>=7:
                return (struct.unpack(">H",blob[i+5:i+7])[0],struct.unpack(">H",blob[i+3:i+5])[0])
            i+=n
    return (0,0)
def main():
    items=json.loads((ROOT/"data/workshop-v2.json").read_text())
    for item in items:
        if item["id"] not in {"3718140217","3821205482","3658866132","3695393157"}:continue
        print("VESSEL",item["id"],item["title"])
        urls=([item["preview_url"]] if item.get("preview_url") else [])+item.get("gallery_urls",[])
        for url in urls:
            cached=item.get("images",{}).get(url)
            if cached:
                local=ROOT/cached.lstrip("/")
                if local.is_file():
                    print("IMAGE", "preview" if url==item["preview_url"] else "gallery", dimensions(local), "bytes",local.stat().st_size,"url",url[:150])
                else:print("MISSING FILE",cached)
            else:print("UNCACHED",url[:150])
if __name__=="__main__":main()
