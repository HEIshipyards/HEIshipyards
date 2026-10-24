// HEI public page overlays, v2.
// Public Lore and Crews are loaded from their published GitHub-backed JSON,
// while all ship overlays continue to work as they did previously.
(function(){
  "use strict";
  let pages=Object.create(null);
  let companyPages=Object.create(null);
  let companyRequest=0;
  function activeRoute(){
    try{return decodeURIComponent(location.hash.slice(1))||"home";}
    catch(_){return "home";}
  }
  function showCompany(key){
    if(activeRoute()!==key)return;
    const root=document.getElementById("page-content");
    const record=companyPages[key];
    if(!root||!record)return;
    if(typeof record.html==="string"){
      root.innerHTML=record.html;
    }else if(typeof record.base64==="string"){
      try{
        const binary=atob(record.base64);
        root.innerHTML=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
      }catch(error){console.error("HEI: unable to decode "+key,error);}
    }
  }
  async function refreshCompany(){
    const requestId=++companyRequest;
    const route=activeRoute();
    if(route!=="lore"&&route!=="crews")return;
    try{
      // Query parameter avoids stale Cloudflare/browser JSON responses after publishing.
      const response=await fetch("/data/editor-pages.json?revision="+Date.now(),{cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const data=await response.json();
      if(!data||typeof data!=="object"||!data.lore||!data.crews)throw Error("Published content JSON is incomplete.");
      if(requestId!==companyRequest)return;
      companyPages=data;
      showCompany(activeRoute());
      window.heiPublicContentStatus={ok:true,loadedAt:new Date().toISOString()};
    }catch(error){
      console.error("HEI: public company content fetch failed.",error);
      window.heiPublicContentStatus={ok:false,error:String(error)};
      if(requestId!==companyRequest||activeRoute()!=="lore"&&activeRoute()!=="crews")return;
      const root=document.getElementById("page-content");
      if(root&&!root.querySelector("[data-hei-content-warning]")){
        const message=document.createElement("p");
        message.dataset.heiContentWarning="true";
        message.style.cssText="border:1px solid #d97d35;padding:12px;border-radius:6px;color:#efc49f";
        message.textContent="The latest published archive could not be loaded. This is the original built-in version. Reload the page to retry.";
        root.prepend(message);
      }
    }
  }
  function apply(route){
    const key=route||activeRoute();
    if(key==="lore"||key==="crews"){
      showCompany(key);
      refreshCompany();
      return;
    }
    const edit=pages[key];
    const root=document.getElementById("page-content");
    if(!root||!edit||!root.querySelector(".ship-section"))return;
    const specifications=root.querySelector(".ship-section[id$='-specs'] table.spec-table tbody");
    if(specifications&&Array.isArray(edit.specs)){
      const rows=document.createDocumentFragment();
      for(const pair of edit.specs){
        if(!Array.isArray(pair)||pair.length!==2||!String(pair[0]).trim())continue;
        const tr=document.createElement("tr");
        const label=document.createElement("td"),value=document.createElement("td");
        label.textContent=pair[0];value.textContent=pair[1]||"N/A";
        tr.append(label,value);rows.append(tr);
      }
      specifications.replaceChildren(rows);
    }
    if(edit.lore&&typeof edit.lore==="object"){
      const lead=root.querySelector(".ship-section.exc-hero .ship-lead");
      if(lead&&typeof edit.lore.intro==="string")lead.textContent=edit.lore.intro;
      const history=root.querySelector(".ship-section[id$='-history'] .content-panel");
      if(history&&Array.isArray(edit.lore.sections)){
        const contents=document.createDocumentFragment();
        for(const pair of edit.lore.sections){
          if(!Array.isArray(pair)||pair.length!==2||!String(pair[0]).trim())continue;
          const heading=document.createElement("h3");heading.textContent=pair[0];
          const text=document.createElement("p");text.textContent=pair[1]||"";
          contents.append(heading,text);
        }
        history.replaceChildren(contents);
      }
    }
  }
  window.heiApplyShipPageEdits=apply;
  fetch("/data/ship-pages.json",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("Ship-page content unavailable.");return r.json();})
    .then(json=>{if(json&&typeof json==="object"&&!Array.isArray(json)){
      pages=json;
      // Don't re-fetch company content when ship registry arrives.
      if(!["lore","crews"].includes(activeRoute()))apply();
    }})
    .catch(error=>console.warn("HEI ship page edits unavailable; showing built-in ship pages.",error));
  // The public page's first render occurs before this deferred script is loaded.
  // Trigger initial company content load here and use the site's render callback thereafter.
  apply();
})();
