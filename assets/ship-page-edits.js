// Public vessel-page rendering overlay. Company lore and Workshop metadata are unaffected.
(function(){
  "use strict";
  let pages=Object.create(null);
  function apply(route){
    const key=route||decodeURIComponent(location.hash.slice(1));
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
    .then(r=>{if(!r.ok)throw Error("Ship-page content unavailable.");return r.json()})
    .then(json=>{
      if(json&&typeof json==="object"&&!Array.isArray(json)){
        pages=json;
        apply();
      }
    })
    .catch(err=>{console.warn("HEI ship page edits unavailable; showing built-in ship pages.",err)});
})();
