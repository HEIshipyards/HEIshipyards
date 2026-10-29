(function(){
"use strict";
const veil=document.getElementById("heiAuthGate");
const app=document.getElementById("heiAuthenticatedApp");
const msg=document.getElementById("heiAuthMessage");
if(!veil||!app)return;
const controller=new AbortController();
async function verify(){
 veil.hidden=false;app.hidden=true;
 if(msg)msg.textContent="Verifying your Cloudflare Access session…";
 try{
  const r=await fetch("/api/admin-session",{credentials:"same-origin",cache:"no-store",signal:controller.signal,headers:{"Accept":"application/json"}});
  if(!r.ok)throw Error(r.status===401||r.status===403?"Sign in with your approved HEI admin account.":"Admin session verification failed (HTTP "+r.status+").");
  const data=await r.json();
  if(data.authenticated!==true)throw Error("Admin session not verified.");
  window.heiAdminAuthenticated=true;
  veil.hidden=true;app.hidden=false;
  for(const scriptPath of ["/assets/admin-editor-v5.js","/assets/admin-crews-manuscript.js"]){
   await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=scriptPath;script.onload=resolve;script.onerror=()=>reject(Error("Editor script could not load: "+scriptPath));document.body.append(script);});
  }
 }catch(error){window.heiAdminAuthenticated=false;veil.hidden=false;app.hidden=true;if(msg)msg.textContent=error.message+" Use Sign in / reconnect and try again.";}
}
document.getElementById("heiAuthRetry")?.addEventListener("click",verify);
verify();
})();