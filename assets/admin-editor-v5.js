(function(){
"use strict";
const panel=document.createElement("section");
panel.id="heiCompanyEditor";
panel.hidden=true;
panel.innerHTML=`<div class="hei-content-intro"><h2 id="heiContentHeading">Company Lore</h2><p class="note">Edit the public page below. Existing content is preloaded; changes are only live after publishing.</p></div>
<div class="row"><button type="button" id="heiImportFile" class="primary">Import document</button><button type="button" id="heiPasteFormatted">Paste formatted content</button><button type="button" id="heiUploadPicture">Insert image</button><button type="button" id="heiPreviewToggle">Preview website layout</button></div>
<input type="file" id="heiImportInput" accept=".html,.htm,.txt,.md,text/html,text/plain,text/markdown" hidden>
<input type="file" id="heiArticleImageInput" accept="image/jpeg,image/png,image/webp" hidden>
<p class="note">Import HTML, Markdown or text; or paste formatted content copied from Word / Google Docs. For Word files, export to HTML first. Import replaces the current document without publishing it.</p>
<div class="hei-content-toolbar" role="toolbar" aria-label="Content formatting">
<button type="button" data-format="bold"><b>B</b></button><button type="button" data-format="italic"><i>I</i></button>
<button type="button" data-format="h2">Heading</button><button type="button" data-format="h3">Subheading</button>
<button type="button" data-format="p">Paragraph</button><button type="button" data-format="insertUnorderedList">• List</button>
</div>
<div id="heiCompanyDocument" class="hei-company-document" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>
<div id="heiImportPreview" hidden><h3>Unpublished page preview</h3><iframe id="heiPreviewFrame" sandbox="" title="Unpublished page preview" style="width:100%;height:570px;background:#151d23;border:1px solid #586c77;border-radius:6px"></iframe></div>
<div class="row"><button type="button" id="heiCompanyPublish" class="primary">Publish page updates</button><button type="button" id="heiCompanyReset">Discard edits</button><a href="/#lore" id="heiViewCompany" target="_blank" rel="noopener">View public page ↗</a></div>
<p id="heiCompanyStatus" class="note" role="status" aria-live="polite"></p>`;
const fleetArea=document.querySelector("main > .layout");
if(!fleetArea){
 document.querySelector("main")?.append(panel);
 panel.hidden=false;
 panel.innerHTML="<h2>Open the main website editor</h2><p>This old editor address has been replaced. <a href='/admin.html'>Open /admin.html</a>.</p>";
 return;
}
fleetArea.before(panel);
const intro=document.querySelector("main > p.note");
const tabs=document.createElement("nav");
tabs.className="hei-editor-tabs";
tabs.setAttribute("aria-label","Choose website section to edit");
tabs.innerHTML='<button type="button" data-hei-tab="fleet">The Fleet</button><button type="button" data-hei-tab="lore">Lore</button><button type="button" data-hei-tab="crews">Crews of the Almagest</button>';
intro?.after(tabs);

const style=document.createElement("style");
style.textContent=`.layout[hidden],#heiCompanyEditor[hidden]{display:none!important}#heiCompanyEditor{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px;width:100%} .hei-editor-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:24px 0}.hei-editor-tabs button{display:inline-block;text-decoration:none;color:var(--text);font-weight:700;padding:12px 20px;border:1px solid var(--line);border-radius:6px;background:#354751}.hei-editor-tabs button.active,.hei-editor-tabs button[aria-pressed="true"]{border-color:var(--orange)!important;background:var(--orange)!important;color:#161b20!important}.hei-content-intro{margin-bottom:16px}.hei-content-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.hei-content-toolbar button{padding:8px 12px}.hei-company-document{min-height:440px;max-height:76vh;overflow:auto;border:1px solid var(--line);background:#1b2832;border-radius:10px;padding:22px;line-height:1.7;overflow-wrap:anywhere}.hei-company-document:focus{outline:2px solid var(--orange)}.hei-company-document h2,.hei-company-document h3{color:#e6b188}.hei-company-document a{color:#e6b188}.hei-company-document .lore-index{padding:14px}.hei-company-document .crews-restricted{text-align:center;padding:50px 20px}.hei-company-document img{max-width:100%;height:auto}#heiCompanyEditor{margin:0 auto;max-width:1100px}#heiCompanyStatus{min-height:1.5em;white-space:pre-wrap}`;
document.head.append(style);
const $=id=>document.getElementById(id);
const doc=$("heiCompanyDocument");
let active="fleet",pages=null,version="",busy=false,loaded={};
const dirty=new Set();
let publishingCheck=null;
function showMessage(msg,error){$("heiCompanyStatus").textContent=msg;$("heiCompanyStatus").className=error?"danger":"note";}
function fromBase64(value){const raw=atob(value);return new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));}
function pageHTML(key){const record=pages?.[key]||{};return typeof record.html==="string"?record.html:(record.base64?fromBase64(record.base64):"");}
function cleanHTML(markup){
 const source=document.createElement("template");source.innerHTML=markup;
 const allowed=new Set(["DIV","SECTION","ARTICLE","NAV","HEADER","FOOTER","DETAILS","SUMMARY","SPAN","P","H1","H2","H3","H4","H5","H6","STRONG","B","EM","I","U","S","BR","HR","UL","OL","LI","BLOCKQUOTE","A","SMALL","SUP","SUB","TABLE","THEAD","TBODY","TFOOT","TR","TH","TD","IMG","FIGURE","FIGCAPTION","PRE","CODE"]);
 const keepStyle=new Set(["color","background-color","font-size","font-family","font-weight","font-style","text-align","text-decoration","line-height","letter-spacing","margin-left","padding-left","width","max-width","height"]);
 function safeStyle(style){
  const el=document.createElement("span");el.setAttribute("style",style);
  const filtered=[];
  for(const key of keepStyle){
   const value=el.style.getPropertyValue(key).trim();
   if(!value || /[<>\\{}]|url\s*\(|var\s*\(|expression\s*\(|@import|--|[;]/i.test(value))continue;
   if(key==="color"||key==="background-color"){if(!/^(#[a-f0-9]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s]+\)|[a-z]{3,20})$/i.test(value))continue;}
   else if(key==="font-family"){if(!/^[a-z0-9 ,"'-]{1,100}$/i.test(value))continue;}
   else if(["font-weight","font-style","text-align","text-decoration"].includes(key)){if(!/^[a-z0-9 -]{1,32}$/i.test(value))continue;}
   else if(!/^[0-9.]{1,6}(?:px|em|rem|%|pt)?$/i.test(value))continue;
   filtered.push(key+":"+value);
  }
  return filtered.join(";");
 }
 function clean(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  if(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","SVG","MATH","FORM","INPUT","BUTTON","META","LINK","BASE","TEMPLATE"].includes(node.tagName))return document.createDocumentFragment();
  const tag=allowed.has(node.tagName)?node.tagName.toLowerCase():"span";
  const n=document.createElement(tag);
  for(const key of ["class","id","title","alt","colspan","rowspan","open","width","height"]){
   const value=node.getAttribute(key);
   if(value===null)continue;
   if(key==="class"||key==="id"){if(/^[a-z0-9 _-]{1,150}$/i.test(value))n.setAttribute(key,value);}
   else if(["width","height","colspan","rowspan"].includes(key)){if(/^\d{1,4}$/.test(value))n.setAttribute(key,value);}
   else if(key==="open")n.setAttribute("open","");
   else n.setAttribute(key,value.slice(0,250));
  }
  const style=safeStyle(node.getAttribute("style")||"");
  if(style)n.setAttribute("style",style);
  if(tag==="a"){
   const href=node.getAttribute("href")||"";
   if(/^(https:\/\/[^\s<>"']+|#[a-z0-9_-]+|\/#(?:lore|crews|home))$/i.test(href))n.setAttribute("href",href);
   if(node.getAttribute("target")==="_blank"){n.setAttribute("target","_blank");n.setAttribute("rel","noopener noreferrer");}
  }
  if(tag==="img"){
   const src=node.getAttribute("src")||"";
   if(/^\/assets\/articles\/(?:lore|crews)\/[a-f0-9]{32}\.(?:jpg|png|webp)$/.test(src)||/^https:\/\/[^\s<>"']+$/i.test(src))n.setAttribute("src",src);
  }
  for(const child of [...node.childNodes])n.append(clean(child));
  return n;
 }
 const output=document.createElement("div");
 for(const node of [...source.content.childNodes])output.append(clean(node));
 return output.innerHTML;
}
function markdownToHTML(value){
 const lines=value.replace(/\r\n?/g,"\n").split("\n"), result=[];
 let list=false;
 const escapeText=x=>x.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
 for(const line of lines){
  if(/^\s*[-*] /.test(line)){if(!list){result.push("<ul>");list=true;}result.push("<li>"+escapeText(line.replace(/^\s*[-*] /,""))+"</li>");continue;}
  if(list){result.push("</ul>");list=false;}
  const heading=line.match(/^(#{1,6})\s+(.+)$/);
  if(heading)result.push("<h"+heading[1].length+">"+escapeText(heading[2])+"</h"+heading[1].length+">");
  else if(line.trim())result.push("<p>"+escapeText(line)+"</p>");
 }
 if(list)result.push("</ul>");
 return result.join("\n");
}
function loadEmbeddedPages(){
 if(pages)return true;
 const embedded=document.getElementById("heiEditorEmbeddedData");
 if(embedded){
  try{
   const data=JSON.parse(embedded.textContent);
   if(data&&data.lore&&data.crews){pages=data;return true;}
  }catch(error){showMessage("Embedded page content could not be read: "+error.message,true);}
 }
 return false;
}
async function checkPublishingAccess(){
 if(publishingCheck)return publishingCheck;
 publishingCheck=(async()=>{
  try{
   const response=await fetch("/api/editor-pages",{cache:"no-store",credentials:"same-origin"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const data=await response.json();
   if(!data.version||!data.pages)throw Error("Incomplete publishing response.");
   version=data.version;
   pages=data.pages;
   // The embedded document is only an initial fallback. Once GitHub has replied,
   // refresh unmodified editors so they show the actual latest published version.
   for(const key of ["lore","crews"])if(!dirty.has(key))delete loaded[key];
   if(active!=="fleet"&&!dirty.has(active))doc.innerHTML=pageHTML(active);
   $("heiCompanyPublish").disabled=false;
   showMessage(dirty.has(active)?"Latest published version checked. Your unpublished changes are preserved.":"Latest published document loaded from GitHub. Ready to publish.");
  }catch(error){
   version="";
   $("heiCompanyPublish").disabled=true;
   showMessage("Saved document loaded, but the publishing API is unavailable: "+error.message+". Use the reconnect option above, then retry.",true);window.heiBackendError?.(error);
  }finally{publishingCheck=null;}
 })();
 return publishingCheck;
}
async function loadPages(){
 if(!loadEmbeddedPages()){
  const response=await fetch("/data/editor-pages.json",{cache:"no-store"});
  if(!response.ok)throw Error("Published content unavailable (HTTP "+response.status+").");
  pages=await response.json();
 }
}
async function switchArea(next){
 if(!["fleet","lore","crews"].includes(next))return;
 if(active!=="fleet"&&pages&&dirty.has(active))loaded[active]=cleanHTML(doc.innerHTML);
 active=next;
 fleetArea.hidden=next!=="fleet";
 panel.hidden=next==="fleet";
 for(const button of tabs.querySelectorAll("button")){
  const selected=button.dataset.heiTab===next;
  button.classList.toggle("active",selected);
  button.setAttribute("aria-pressed",String(selected));
 }
 if(next==="fleet")return;
 $("heiContentHeading").textContent=next==="lore"?"Company Lore":"Crews of the Almagest";
 $("heiViewCompany").href="/#"+next;
 $("heiCompanyPublish").disabled=!version;
 if(!loadEmbeddedPages())showMessage("Loading published page content…");
 try{
  await loadPages();
  if(active!==next)return;
  const html=loaded[next]??pageHTML(next);
  doc.innerHTML=html;
  showMessage(html?"Content loaded. Edit the document below.":"This page has no saved content yet.");
  if(!version)checkPublishingAccess();
 }catch(error){
  showMessage("Could not load "+next+" content: "+error.message,true);
  doc.textContent="Unable to load the saved page content.";
  $("heiCompanyPublish").disabled=true;
 }
}
tabs.addEventListener("click",event=>{
 const button=event.target.closest("button[data-hei-tab]");
 if(button)switchArea(button.dataset.heiTab);
});
const requestedSection=new URLSearchParams(location.search).get("section");
switchArea(["lore","crews"].includes(requestedSection)?requestedSection:"fleet");
const importInput=$("heiImportInput");
$("heiImportFile").onclick=()=>{importInput.value="";importInput.click();};
function insertImported(raw,format){
 if(!["lore","crews"].includes(active))return;
 if(raw.length>500000){showMessage("Document exceeds 500 KB before conversion.",true);return;}
 const html=format==="html"?raw:format==="md"?markdownToHTML(raw):raw.split(/\r?\n\r?\n/).map(p=>"<p>"+p.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")+"</p>").join("");
 const cleaned=cleanHTML(html);
 if(!cleaned.trim()){showMessage("No usable content found in document.",true);return;}
 if(cleaned.length>180000){showMessage("Formatted content is too large to publish (180,000 HTML characters).",true);return;}
 if(!confirm("Replace the current "+active+" document with this imported content? It will not go live until you publish."))return;
 doc.innerHTML=cleaned;loaded[active]=cleaned;dirty.add(active);
 showMessage("Imported "+format.toUpperCase()+" document. Review the preview before publishing.");
 if(!$("heiImportPreview").hidden)updatePreview();
}
importInput.addEventListener("change",async()=>{
 const file=importInput.files?.[0];if(!file)return;
 const name=file.name.toLowerCase();
 if(!/\.(html?|txt|md)$/.test(name)){showMessage("Choose an HTML, Markdown, or text file. Export DOCX to HTML first.",true);return;}
 if(file.size>500000){showMessage("Document is too large (500 KB import limit).",true);return;}
 try{insertImported(await file.text(),/\.html?$/.test(name)?"html":/\.md$/.test(name)?"md":"txt");}
 catch(e){showMessage("Import failed: "+e.message,true);}
});
$("heiPasteFormatted").onclick=async()=>{
 try{
  const clipboard=await navigator.clipboard.read();
  let html="";
  for(const item of clipboard){if(item.types.includes("text/html")){html=await (await item.getType("text/html")).text();break;}}
  if(html){insertImported(html,"html");return;}
  showMessage("No formatted HTML on clipboard. Copy from Word/Docs, or use Import document.",true);
 }catch(e){showMessage("Clipboard permission denied. Paste directly into the editor with Ctrl+V instead.",true);}
};
doc.addEventListener("paste",event=>{
 const html=event.clipboardData?.getData("text/html");
 if(!html)return;
 event.preventDefault();
 const cleaned=cleanHTML(html);
 document.execCommand("insertHTML",false,cleaned);
});
function updatePreview(){
 const content=cleanHTML(doc.innerHTML);
 const styles='body{font:16px/1.65 system-ui,sans-serif;background:#151d23;color:#e3eaed;max-width:920px;margin:auto;padding:32px}h1,h2,h3{color:#d97d35}a{color:#edb782}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #53646c;padding:8px}';
 $("heiPreviewFrame").srcdoc='<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https:; style-src \'unsafe-inline\'"><style>'+styles+'</style></head><body>'+content+'</body></html>';
}
$("heiPreviewToggle").onclick=()=>{
 const box=$("heiImportPreview");box.hidden=!box.hidden;
 if(!box.hidden)updatePreview();
};
$("heiUploadPicture").onclick=()=>{$("heiArticleImageInput").value="";$("heiArticleImageInput").click();};
$("heiArticleImageInput").onchange=async()=>{
 const file=$("heiArticleImageInput").files?.[0];if(!file)return;
 if(file.size>3500000||!["image/jpeg","image/png","image/webp"].includes(file.type)){showMessage("Use a JPEG, PNG, or WebP under 3.5 MB.",true);return;}
 try{
  showMessage("Uploading article image…");
  const base64=await new Promise((ok,fail)=>{const reader=new FileReader();reader.onload=()=>ok(String(reader.result).split(",")[1]);reader.onerror=()=>fail(Error("Could not read image."));reader.readAsDataURL(file);});
  const response=await fetch("/api/page-upload",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({page:active,base64})});
  const data=await response.json();if(!response.ok)throw Error(data.error||"Image upload failed.");
  doc.focus();document.execCommand("insertHTML",false,'<img src="'+data.url+'" alt="Article image">');
  dirty.add(active);showMessage("Image uploaded and inserted. Publish the page to make the change live.");
 }catch(e){showMessage(e.message,true);}
};
panel.querySelector(".hei-content-toolbar").addEventListener("click",e=>{
 const button=e.target.closest("button[data-format]");if(!button)return;
 doc.focus();const cmd=button.dataset.format;document.execCommand(["h2","h3","p"].includes(cmd)?"formatBlock":cmd,false,["h2","h3","p"].includes(cmd)?cmd:null);
});
doc.addEventListener("click",e=>{if(e.target.closest("a"))e.preventDefault();});
doc.addEventListener("input",()=>{if(active!=="fleet")dirty.add(active);});

$("heiCompanyReset").onclick=()=>{if(!pages)return;dirty.delete(active);delete loaded[active];doc.innerHTML=pageHTML(active);showMessage("Unpublished edits discarded. Showing the latest loaded document.");};
$("heiCompanyPublish").onclick=async()=>{
 if(busy||!pages||!version||active==="fleet")return;
 const key=active,html=cleanHTML(doc.innerHTML);
 if(html.length>180000){showMessage("This document is too large to publish.",true);return;}
 busy=true;$("heiCompanyPublish").disabled=true;showMessage("Publishing "+key+" page to GitHub…");
 try{
  const r=await fetch("/api/editor-pages",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({page:key,version,html})});
  const data=await r.json();if(!r.ok)throw Error(data.error||"Publish failed");
  version=data.version;pages[key]=data.page;dirty.delete(key);delete loaded[key];showMessage("Published to GitHub. Cloudflare will deploy your "+key+" page automatically.");
 }catch(e){showMessage(e.message,true);}finally{busy=false;$("heiCompanyPublish").disabled=false;}
};
})();