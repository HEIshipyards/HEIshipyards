(function(){
"use strict";
const host=document.getElementById("heiCompanyEditor");if(!host)return;
const area=document.createElement("section");area.id="heiStoryEditor";area.hidden=true;
area.innerHTML='<hr><h2 style="color:#efb27c">Crews of the Almagest — Chapter Importer</h2><p class="note">Import a story manuscript or edit chapters individually. This publishes the story archive, not the warning entrance above.</p><div class="row"><button id="storyImport" type="button" class="primary">Import DOCX / TXT / HTML / MD</button><button id="storyAdd" type="button">+ Add chapter</button><button id="storyReload" type="button">Reload published story</button><a href="/crews-archive.html" target="_blank" rel="noopener">View archive ↗</a></div><input type="file" id="storyFile" accept=".docx,.txt,.md,.html,.htm" hidden><p class="note">Use a heading like "Chapter 1 — The Shipyard" to separate chapters. Import creates editable chapter number, name, and body fields. PDFs need exporting to DOCX or text first. Embedded images are not imported.</p><p id="storyStatus" class="note" role="status" aria-live="polite"></p><div id="storyChapters"></div><div class="row"><button type="button" class="primary" id="storyPublish">Publish story chapters</button><button type="button" id="storyDiscard">Discard draft edits</button></div>';
host.append(area);
const css=document.createElement("style");css.textContent='#heiStoryEditor[hidden]{display:none!important}#storyChapters{display:grid;gap:14px;margin:18px 0}.story-card{padding:18px;background:#17242d;border:1px solid #64747e;border-radius:8px}.story-card summary{cursor:pointer;color:#f2bd8b;font-weight:800}.story-card label{display:block;margin:12px 0 6px}.story-card textarea{min-height:240px;font:15px/1.6 Georgia,serif}.story-fields{display:grid;grid-template-columns:115px 1fr;gap:12px}.story-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:600px){.story-fields{grid-template-columns:1fr}}';document.head.append(css);
const $=id=>document.getElementById(id),container=$("storyChapters");let version="",documentData=null,snapshot=null,dirty=false,loading=false;
function message(msg,bad){$("storyStatus").textContent=msg;$("storyStatus").className=bad?"danger":"note";}
function cards(){return [...container.querySelectorAll(".story-card")];}
function capture(){return cards().map(c=>({number:Number(c.querySelector('[data-part="number"]').value),title:c.querySelector('[data-part="title"]').value,text:c.querySelector('[data-part="text"]').value}));}
function updateHeaders(){cards().forEach(c=>c.querySelector("summary").textContent="Chapter "+c.querySelector('[data-part="number"]').value+" — "+c.querySelector('[data-part="title"]').value);$("storyPublish").disabled=!version||loading;}
function render(chapters){container.replaceChildren();chapters.forEach((chapter,index)=>{
 const card=document.createElement("details");card.className="story-card";card.open=index===0;
 const sum=document.createElement("summary"),row=document.createElement("div");row.className="story-fields";
 function field(label,tag,part,value,parent){const wrap=document.createElement("div"),l=document.createElement("label"),i=document.createElement(tag);l.textContent=label;i.dataset.part=part;i.value=value;if(tag==="input")i.type=part==="number"?"number":"text";wrap.append(l,i);parent.append(wrap);i.addEventListener("input",()=>{dirty=true;updateHeaders();});return i;}
 const number=field("Chapter #","input","number",chapter.number,row);number.min=1;number.max=9999;
 field("Chapter name","input","title",chapter.title,row);
 const bodyWrap=document.createElement("div");field("Chapter body","textarea","text",chapter.text,bodyWrap);
 const tools=document.createElement("div");tools.className="story-tools";
 function action(label,fn){const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=fn;tools.append(b);}
 action("↑ Move up",()=>{const before=card.previousElementSibling;if(before){before.before(card);dirty=true;}});
 action("↓ Move down",()=>{const after=card.nextElementSibling;if(after){after.after(card);dirty=true;}});
 action("Remove chapter",()=>{if(confirm("Remove this chapter from the unpublished draft?")){card.remove();dirty=true;}});
 card.append(sum,row,bodyWrap,tools);container.append(card);
});updateHeaders();}
async function load(){if(dirty&&!confirm("Discard unpublished story edits?"))return;loading=true;updateHeaders();message("Loading the published manuscript…");
 try{const r=await fetch("/api/crews-manuscript",{credentials:"same-origin",cache:"no-store"}),data=await r.json();if(!r.ok)throw Error(data.error||"Archive unavailable");version=data.version;documentData=data.manuscript;snapshot=JSON.parse(JSON.stringify(documentData));dirty=false;render(documentData.chapters);message("Loaded "+documentData.chapters.length+" chapters. Import or edit below.");}
 catch(e){message(e.message,true);window.heiBackendError?.(e);}finally{loading=false;updateHeaders();}}
function delimit(text){text=text.replace(/\r\n?/g,"\n").replace(/\u00a0/g," ").trim();const matches=[...text.matchAll(/^[ \t]*(?:#{1,6}[ \t]*)?Chapter[ \t]+(\d{1,4})[ \t]*(?:[—–:-][ \t]*|-[ \t]+)([^\n]{1,180})[ \t]*$/gim)];if(!matches.length)throw Error('No chapter boundaries found; use "Chapter 1 — Chapter Name".');
 const chapters=matches.map((m,i)=>({number:Number(m[1]),title:m[2].trim(),text:text.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:text.length).trim()}));
 if(chapters.some(c=>!c.title||!c.text))throw Error("Some chapters are missing a title or body.");if(new Set(chapters.map(c=>c.number)).size!==chapters.length)throw Error("Duplicate chapter numbers.");return chapters;}
async function docxText(file){
 const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-66000);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error("Invalid Word document.");let offset=v.getUint32(end+16,true);const count=v.getUint16(end+10,true);
 for(let n=0;n<count;n++){
 if(v.getUint32(offset,true)!==0x02014b50)throw Error("Corrupt DOCX directory.");
 const method=v.getUint16(offset+10,true),length=v.getUint32(offset+20,true),nl=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true),local=v.getUint32(offset+42,true);
 const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nl));
 if(name==="word/document.xml"){const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);const zipped=bytes.subarray(start,start+length);
 const data=method===0?zipped:method===8?new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()):null;
 if(!data)throw Error("Unsupported Word compression.");const xml=new DOMParser().parseFromString(new TextDecoder().decode(data),"application/xml");if(xml.querySelector("parsererror"))throw Error("Word document XML invalid.");
 const ns="http://schemas.openxmlformats.org/wordprocessingml/2006/main";
 return [...xml.getElementsByTagNameNS(ns,"p")].map(p=>[...p.getElementsByTagNameNS(ns,"t")].map(t=>t.textContent).join("")).join("\n\n");}
 offset+=46+nl+extra+comment;
 }throw Error("Word document is missing its body.");
}
$("storyImport").onclick=()=>{$("storyFile").value="";$("storyFile").click();};
$("storyFile").addEventListener("change",async()=>{const file=$("storyFile").files?.[0];if(!file)return;if(dirty&&!confirm("Replace your unpublished chapter edits with this import?"))return;loading=true;updateHeaders();message("Reading "+file.name+"…");
 try{if(file.size>15000000)throw Error("File is over the 15 MB import limit.");const ext=file.name.split(".").pop().toLowerCase();let text="";
 if(ext==="docx")text=await docxText(file);else if(["txt","md","html","htm"].includes(ext)){text=await file.text();if(ext==="html"||ext==="htm"){const doc=new DOMParser().parseFromString(text,"text/html");doc.querySelectorAll("script,style").forEach(n=>n.remove());text=doc.body.textContent||"";}}else throw Error("Use DOCX, TXT, HTML or Markdown; export PDF to DOCX first.");
 const chapters=delimit(text);if(chapters.length>120||chapters.reduce((n,c)=>n+c.text.length,0)>750000)throw Error("Manuscript exceeds the archive size limit.");
 documentData={...documentData,source:file.name,chapters};render(chapters);dirty=true;message("Imported "+chapters.length+" chapters. Review the separate chapter names and bodies below before publishing.");
 }catch(e){message("Import failed: "+e.message,true);}finally{loading=false;updateHeaders();}});
$("storyAdd").onclick=()=>{const list=capture(),num=Math.max(0,...list.map(c=>c.number||0))+1;list.push({number:num,title:"Untitled chapter",text:""});render(list);dirty=true;container.lastElementChild.open=true;};
$("storyReload").onclick=load;
$("storyDiscard").onclick=()=>{if(!snapshot)return;if(dirty&&!confirm("Discard unpublished manuscript changes?"))return;documentData=JSON.parse(JSON.stringify(snapshot));render(documentData.chapters);dirty=false;message("Draft changes discarded.");};
$("storyPublish").onclick=async()=>{if(loading||!version)return;const chapters=capture(),seen=new Set();
 if(!chapters.length||chapters.length>120){message("The story needs 1–120 chapters.",true);return;}
 for(const c of chapters){if(!Number.isInteger(c.number)||c.number<1||c.number>9999||seen.has(c.number)||!c.title.trim()||!c.text.trim()){message("Every chapter must have a unique positive number, name, and body.",true);return;}seen.add(c.number);}
 if(!confirm("Publish "+chapters.length+" chapters to the public Crews archive?"))return;
 loading=true;updateHeaders();message("Publishing chapters to GitHub…");
 try{const r=await fetch("/api/crews-manuscript",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({version,manuscript:{...documentData,chapters}})}),data=await r.json();if(!r.ok)throw Error(data.error||"Publishing failed");version=data.version;documentData=data.manuscript;snapshot=JSON.parse(JSON.stringify(documentData));dirty=false;message("Published "+chapters.length+" chapters. Cloudflare Pages will deploy the public archive automatically.");}
 catch(e){message("Publishing failed: "+e.message,true);}finally{loading=false;updateHeaders();}};
let initialized=false;function sync(){const active=document.querySelector('.hei-editor-tabs button[data-hei-tab="crews"]')?.getAttribute("aria-pressed")==="true";area.hidden=!active;if(active&&!initialized){initialized=true;load();}}
document.querySelector(".hei-editor-tabs")?.addEventListener("click",()=>setTimeout(sync,0));sync();
})();