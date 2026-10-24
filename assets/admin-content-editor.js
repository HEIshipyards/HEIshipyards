(function(){
"use strict";
const panel=document.createElement("section");
panel.id="heiCompanyEditor";
panel.hidden=true;
panel.innerHTML=`<div class="hei-content-intro"><h2 id="heiContentHeading">Company Lore</h2><p class="note">Edit the public page below. Existing content is preloaded; changes are only live after publishing.</p></div>
<div class="hei-content-toolbar" role="toolbar" aria-label="Content formatting">
<button type="button" data-format="bold"><b>B</b></button><button type="button" data-format="italic"><i>I</i></button>
<button type="button" data-format="h2">Heading</button><button type="button" data-format="h3">Subheading</button>
<button type="button" data-format="p">Paragraph</button><button type="button" data-format="insertUnorderedList">• List</button>
</div>
<div id="heiCompanyDocument" class="hei-company-document" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true"></div>
<div class="row"><button type="button" id="heiCompanyPublish" class="primary">Publish page updates</button><button type="button" id="heiCompanyReset">Discard edits</button><a href="/#lore" id="heiViewCompany" target="_blank" rel="noopener">View public page ↗</a></div>
<p id="heiCompanyStatus" class="note" role="status" aria-live="polite"></p>`;
const fleetArea=document.querySelector("main > .layout");
fleetArea.before(panel);
const intro=document.querySelector("main > p.note");
const tabs=document.createElement("nav");
tabs.className="hei-editor-tabs";
tabs.setAttribute("aria-label","Choose website section to edit");
tabs.innerHTML='<button type="button" data-hei-tab="fleet">The Fleet</button><button type="button" data-hei-tab="lore">Lore</button><button type="button" data-hei-tab="crews">Crews of the Almagest</button>';
intro?.after(tabs);

const style=document.createElement("style");
style.textContent=`.layout[hidden],#heiCompanyEditor[hidden]{display:none!important}#heiCompanyEditor{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:20px;width:100%} .hei-editor-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:24px 0}.hei-editor-tabs button{display:inline-block;text-decoration:none;color:var(--text);font-weight:700;padding:12px 20px;border:1px solid var(--line);border-radius:6px;background:#354751}.hei-editor-tabs button.active{border-color:var(--orange);background:#49392a;color:#fff}.hei-content-intro{margin-bottom:16px}.hei-content-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.hei-content-toolbar button{padding:8px 12px}.hei-company-document{min-height:440px;max-height:76vh;overflow:auto;border:1px solid var(--line);background:#1b2832;border-radius:10px;padding:22px;line-height:1.7;overflow-wrap:anywhere}.hei-company-document:focus{outline:2px solid var(--orange)}.hei-company-document h2,.hei-company-document h3{color:#e6b188}.hei-company-document a{color:#e6b188}.hei-company-document .lore-index{padding:14px}.hei-company-document .crews-restricted{text-align:center;padding:50px 20px}.hei-company-document img{max-width:100%;height:auto}#heiCompanyEditor{margin:0 auto;max-width:1100px}#heiCompanyStatus{min-height:1.5em;white-space:pre-wrap}`;
document.head.append(style);
const $=id=>document.getElementById(id);
const doc=$("heiCompanyDocument");
let active="fleet",pages=null,version="",busy=false,loaded={};
function showMessage(msg,error){$("heiCompanyStatus").textContent=msg;$("heiCompanyStatus").className=error?"danger":"note";}
function fromBase64(value){const raw=atob(value);return new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));}
function pageHTML(key){const record=pages?.[key]||{};return typeof record.html==="string"?record.html:(record.base64?fromBase64(record.base64):"");}
function cleanHTML(markup){
 const holder=document.createElement("template");holder.innerHTML=markup;
 const allowed=new Set(["DIV","SECTION","ARTICLE","NAV","HEADER","FOOTER","DETAILS","SUMMARY","SPAN","P","H1","H2","H3","H4","H5","H6","STRONG","B","EM","I","U","BR","HR","UL","OL","LI","BLOCKQUOTE","A","SMALL","SUP","SUB","TABLE","THEAD","TBODY","TR","TH","TD","IMG"]);
 function clean(node){
  if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
  if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
  const tag=allowed.has(node.tagName)?node.tagName.toLowerCase():"span",n=document.createElement(tag);
  for(const attr of ["class","id","title","alt","colspan","rowspan","open"]){if(node.hasAttribute(attr))n.setAttribute(attr,node.getAttribute(attr));}
  if(node.tagName==="A"){
   const href=node.getAttribute("href")||"";
   if(/^(?:#[a-z0-9_-]+|https:\/\/[^\s<>"]+|\/#(?:lore|crews|home))$/i.test(href))n.setAttribute("href",href);
   if(node.getAttribute("target")==="_blank"){n.setAttribute("target","_blank");n.setAttribute("rel","noopener noreferrer");}
  }
  if(node.tagName==="IMG"){const src=node.getAttribute("src")||"";if(/^https:\/\/[^\s<>"]+$/i.test(src)||/^\/assets\/[a-z0-9_./-]+$/i.test(src))n.setAttribute("src",src);}
  for(const child of [...node.childNodes])n.append(clean(child));
  return n;
 }
 const result=document.createElement("div");for(const child of [...holder.content.childNodes])result.append(clean(child));
 return result.innerHTML;
}
async function loadPages(){
 if(pages)return;
 const embedded=document.getElementById("heiEditorEmbeddedData");
 if(embedded){
  try{pages=JSON.parse(embedded.textContent);showMessage("Page content loaded. Checking publishing access…");}
  catch(error){showMessage("Embedded content could not be parsed: "+error.message,true);}
 }
 if(!pages){
  try{
   const response=await fetch("/data/editor-pages.json",{cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   pages=await response.json();
  }catch(error){showMessage("Unable to load page content: "+error.message,true);throw error;}
 }
 // The published document is editable even if the API session is not available.
 try{
  const response=await fetch("/api/editor-pages",{cache:"no-store",credentials:"same-origin"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const data=await response.json();
  if(data.pages&&data.version){pages=data.pages;version=data.version;showMessage("Ready to edit and publish.");}
 }catch(error){version="";showMessage("Content loaded, but publishing authentication could not be verified ("+error.message+").",true);}
}
async function switchArea(next){
 if(!["fleet","lore","crews"].includes(next))return;
 if(active!=="fleet"&&pages)loaded[active]=cleanHTML(doc.innerHTML);
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
 $("heiCompanyPublish").disabled=false;
 try{await loadPages();if(active===next){doc.innerHTML=loaded[next]??pageHTML(next);$("heiCompanyPublish").disabled=!version;}}
 catch(e){showMessage(e.message,true);doc.innerHTML="";$("heiCompanyPublish").disabled=true;}
}
tabs.addEventListener("click",event=>{
 const button=event.target.closest("button[data-hei-tab]");
 if(button)switchArea(button.dataset.heiTab);
});
switchArea("fleet");
panel.querySelector(".hei-content-toolbar").addEventListener("click",e=>{
 const button=e.target.closest("button[data-format]");if(!button)return;
 doc.focus();const cmd=button.dataset.format;document.execCommand(["h2","h3","p"].includes(cmd)?"formatBlock":cmd,false,["h2","h3","p"].includes(cmd)?cmd:null);
});
doc.addEventListener("paste",e=>{e.preventDefault();document.execCommand("insertText",false,e.clipboardData.getData("text/plain"));});
$("heiCompanyReset").onclick=()=>{if(!pages)return;loaded[active]=pageHTML(active);doc.innerHTML=loaded[active];showMessage("Unpublished edits discarded.");};
$("heiCompanyPublish").onclick=async()=>{
 if(busy||!pages||!version||active==="fleet")return;
 const key=active,html=cleanHTML(doc.innerHTML);
 if(html.length>180000){showMessage("This document is too large to publish.",true);return;}
 busy=true;$("heiCompanyPublish").disabled=true;showMessage("Publishing "+key+" page to GitHub…");
 try{
  const r=await fetch("/api/editor-pages",{method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({page:key,version,html})});
  const data=await r.json();if(!r.ok)throw Error(data.error||"Publish failed");
  version=data.version;pages[key]=data.page;loaded[key]=html;showMessage("Published to GitHub. Cloudflare will deploy your "+key+" page automatically.");
 }catch(e){showMessage(e.message,true);}finally{busy=false;$("heiCompanyPublish").disabled=false;}
};
})();