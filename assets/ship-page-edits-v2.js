// HEI public page overlays, v2.
// Public Lore and Crews are loaded from their published GitHub-backed JSON,
// while all ship overlays continue to work as they did previously.
(function(){
  "use strict";
  let pages=Object.create(null);
  let shipPagesReady=false;
  // The published spec registry is authoritative for both the detail table and hero summary.
  const standardSpecs=[
    ["Classification","vessel classification","class"],
    ["Dimensions","size","hull dimensions"],
    ["Baseline mass","base mass","mass"],
    ["Crew complement","crew capacity","crew","nominal crew"],
    ["Operating environment","environment"],
    ["Main propulsion","propulsion"],
    ["Cargo capacity","cargo"],
    ["Power systems","power generation"],
    ["Jump capability","jump drive","jump drives","jump system"],
    ["Weapon complement","weapons complement","armament","weaponry"],
    ["Shipboard automation","automation","automation systems"]
  ];
  const summarySpecs=["Dimensions","Baseline mass","Crew complement","Classification"];
  const normalizeSpecName=name=>String(name||"").trim().toLowerCase().replace(/\s+/g," ");
  function canonicalSpecName(name){
    const normalized=normalizeSpecName(name);
    const entry=standardSpecs.find(spec=>spec.some(alias=>normalizeSpecName(alias)===normalized));
    return entry?entry[0]:null;
  }
  function isUnspecified(value){
    return !String(value??"").trim()||
      /^(?:n\\s*[\\/.]\\s*a\\.?|not\\s+(?:available|applicable|provided|specified|yet\\s+specified)|unknown|tbd|to\\s+be\\s+determined|[-—–]+)$/i.test(String(value).trim());
  }
  function canonicalSpecs(pairs){
    // Exactly eleven core fields, followed by nonempty vessel-specific details.
    const fixed=new Map(),extras=[];
    for(const pair of pairs||[]){
      if(!Array.isArray(pair)||pair.length!==2||!String(pair[0]).trim())continue;
      const label=String(pair[0]).trim();
      const value=String(pair[1]||"").trim();
      const canonical=canonicalSpecName(label);
      if(canonical){
        if(!fixed.has(canonical))fixed.set(canonical,value||"N/A");
      }else if(!isUnspecified(value)){
        extras.push([label,value]);
      }
    }
    return [
      ...standardSpecs.map(([name])=>[name,fixed.get(name)||"N/A"]),
      ...extras
    ];
  }
  function builtInSpecs(body){
    return [...body.querySelectorAll("tr")].map(row=>{
      const cells=row.querySelectorAll("td");
      return cells.length>=2?[cells[0].textContent,cells[1].textContent]:null;
    }).filter(Boolean);
  }
  function renderSpecTable(body,pairs){
    const fragment=document.createDocumentFragment();
    for(const [name,value] of pairs){
      const row=document.createElement("tr");
      const heading=document.createElement("td"),info=document.createElement("td");
      heading.textContent=name;
      info.textContent=value;
      row.append(heading,info);fragment.append(row);
    }
    body.replaceChildren(fragment);
  }
  function renderSpecCarousel(body,pairs){
    const standard=pairs.slice(0,standardSpecs.length);
    const vesselSpecific=pairs.slice(standardSpecs.length);
    const table=body.closest("table");
    if(!table)return;
    let controls=table.parentElement.querySelector(".hei-spec-page-nav");
    if(!controls){
      controls=document.createElement("nav");
      controls.className="hei-spec-page-nav";
      controls.setAttribute("aria-label","Technical specifications pages");
      controls.style.cssText="display:flex;justify-content:center;align-items:center;gap:16px;flex-wrap:wrap;margin:19px 0 0";
      const left=document.createElement("button");
      left.type="button";left.textContent="‹";left.setAttribute("aria-label","Previous specifications");
      const status=document.createElement("span");
      status.className="hei-spec-page-status";
      status.setAttribute("role","status");status.setAttribute("aria-live","polite");
      status.style.cssText="min-width:220px;text-align:center;font-size:.85rem;letter-spacing:.04em;color:var(--steel-light, #d5dfe6)";
      const right=document.createElement("button");
      right.type="button";right.textContent="›";right.setAttribute("aria-label","Next specifications");
      for(const button of [left,right]){
        button.style.cssText="min-width:42px;min-height:42px;border:1px solid var(--line, #4d5d68);background:var(--surface2, #24323b);color:var(--text, #e9eef0);border-radius:4px;font-size:1.5rem;cursor:pointer";
      }
      controls.append(left,status,right);
      table.insertAdjacentElement("afterend",controls);
    }
    const [left,status,right]=controls.children;
    const hasSecondPage=vesselSpecific.length>0;
    controls.hidden=!hasSecondPage;
    controls.style.display=hasSecondPage?"flex":"none";
    let page=0;
    function showPage(next){
      page=hasSecondPage?(next+2)%2:0;
      renderSpecTable(body,page===0?standard:vesselSpecific);
      table.setAttribute("aria-label",page===0?"Standard technical specifications":"Vessel-specific specifications");
      status.textContent=page===0?"Standard Specifications · 1 / 2":"Vessel-Specific Specifications · 2 / 2";
    }
    // Replacing the old controls on reapplication avoids stale click handlers.
    left.onclick=()=>showPage(page-1);
    right.onclick=()=>showPage(page+1);
    showPage(0);
  }
  function renderShipSummary(root,pairs){
    const parent=root.querySelector(".ship-section.exc-hero .ship-stats");
    if(!parent)return;
    const values=new Map(pairs);
    const fragment=document.createDocumentFragment();
    for(const label of summarySpecs){
      const card=document.createElement("div");card.className="stat";
      const name=document.createElement("small");name.textContent=label;
      const value=document.createElement("strong");value.textContent=values.get(label)||"N/A";
      card.append(name,value);fragment.append(card);
    }
    parent.replaceChildren(fragment);
  }

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
    if(!root||!root.querySelector(".ship-section.exc-hero"))return;
    const specifications=root.querySelector(".ship-section[id$='-specs'] table.spec-table tbody");
    if(specifications){
      // Preserve the original rows across asynchronous refreshes, even when a
      // ship has no published record and the user is on page two.
      if(!specifications._heiOriginalSpecs){
        specifications._heiOriginalSpecs=builtInSpecs(specifications);
      }
      const source=shipPagesReady&&Array.isArray(edit?.specs)
        ?edit.specs:specifications._heiOriginalSpecs;
      const unified=canonicalSpecs(source);
      renderSpecCarousel(specifications,unified);
      renderShipSummary(root,unified);
    }
    if(edit?.lore&&typeof edit.lore==="object"){
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
      shipPagesReady=true;
      // Don't re-fetch company content when ship registry arrives.
      if(!["lore","crews"].includes(activeRoute()))apply();
    }})
    .catch(error=>console.warn("HEI ship page edits unavailable; showing built-in ship pages.",error));
  // The public page's first render occurs before this deferred script is loaded.
  // Trigger initial company content load here and use the site's render callback thereafter.
  apply();
})();
