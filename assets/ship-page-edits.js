// Public vessel-page rendering overlay. Company lore and Workshop metadata are unaffected.
(function(){
  "use strict";
  let pages=Object.create(null);
  let companyPages=Object.create(null);
  function apply(route){
    const key=route||decodeURIComponent(location.hash.slice(1));
    if(key==="lore"||key==="crews"){
      const edit=companyPages[key],root=document.getElementById("page-content");
      if(root&&edit){
        if(typeof edit.html==="string")root.innerHTML=edit.html;
        else if(typeof edit.base64==="string"){
          try{const binary=atob(edit.base64);root.innerHTML=new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}catch(e){console.warn("Unable to decode lore",e);}
        }
      }
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
  fetch("/data/editor-pages.json",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("Company pages unavailable");return r.json()})
    .then(data=>{if(data&&typeof data==="object"&&!Array.isArray(data)){companyPages=data;apply();}})
    .catch(error=>console.warn("Using built-in company pages.",error));
  fetch("/data/ship-pages.json",{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("Ship-page content unavailable.");return r.json()})
    .then(json=>{
      if(json&&typeof json==="object"&&!Array.isArray(json)){
        pages=json;
        apply();
      }
    })
    .catch(err=>{console.warn("HEI ship page edits unavailable; showing built-in ship pages.",err)});
})();
