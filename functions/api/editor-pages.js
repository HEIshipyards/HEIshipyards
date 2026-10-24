import {authorize,respond,errorResult} from "../_lib/secure.js";
const REPO="HEIshipyards/HEIshipyards", PATH="data/editor-pages.json";
function decode(s){return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,"")),c=>c.charCodeAt(0)));}
function encode(s){const b=new TextEncoder().encode(s);let out="";for(let i=0;i<b.length;i+=8192)out+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(out);}
async function file(env,method="GET",body){
 const r=await fetch("https://api.github.com/repos/"+REPO+"/contents/"+PATH+(method==="GET"?"?ref=main":""),{
  method,headers:{Authorization:"Bearer "+env.GITHUB_TOKEN,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"HEI-Content-Manager",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Object.assign(Error("GitHub content request failed ("+r.status+")."),{status:r.status===409||r.status===422?409:502});
 return r.json();
}
export async function onRequestGet({request,env}){
 const denied=await authorize(request,env);if(denied)return denied;
 try{const f=await file(env);return respond({pages:JSON.parse(decode(f.content)),version:f.sha});}catch(e){return errorResult(e);}
}
export async function onRequestPut({request,env}){
 const denied=await authorize(request,env);if(denied)return denied;
 if(Number(request.headers.get("content-length")||0)>240000)return respond({error:"Content too large."},413);
 let body;try{body=await request.json();}catch{return respond({error:"Invalid JSON."},400);}
 const {page,html,version}=body||{};
 if(!["lore","crews"].includes(page)||typeof version!=="string"||!/^[a-f0-9]{40}$/.test(version)||typeof html!=="string"||html.length>180000)
   return respond({error:"Invalid content update."},400);
 // Keep editable company HTML free of executable code or unsafe URLs.
 if(/<\s*\/?\s*(?:script|iframe|object|embed|svg|math|form|input|button|meta|link|base|style)\b/i.test(html)||
    /\bon[a-z]+\s*=/i.test(html)||/\b(?:srcdoc|formaction)\s*=/i.test(html)||
    /\b(?:href|src|xlink:href)\s*=\s*['"]?\s*(?:javascript:|data:|vbscript:)/i.test(html))
   return respond({error:"Unsupported HTML or unsafe link found. Remove executable content."},400);
 try{
  const f=await file(env);
  if(f.sha!==version)return respond({error:"Page content changed since loading. Refresh before publishing."},409);
  const pages=JSON.parse(decode(f.content));pages[page]={html};
  await file(env,"PUT",{branch:"main",sha:f.sha,content:encode(JSON.stringify(pages,null,2)+"\n"),message:"Content Manager: update "+page});
  const fresh=await file(env);
  return respond({ok:true,version:fresh.sha,page:pages[page]});
 }catch(e){return errorResult(e);}
}
