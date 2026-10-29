(function(){
"use strict";
const gate=document.getElementById("heiAuthGate");
const app=document.getElementById("heiAuthenticatedApp");
const message=document.getElementById("heiAuthMessage");
const retry=document.getElementById("heiAuthRetry");
if(!gate||!app)return;

let verifying=false;
async function verifySession(){
 if(verifying)return;
 verifying=true;
 gate.hidden=false;
 app.hidden=true;
 window.heiAdminAuthenticated=false;
 if(message)message.textContent="Verifying your Cloudflare Access session…";
 try{
  const response=await fetch("/api/admin-session",{
   credentials:"same-origin",
   cache:"no-store",
   redirect:"follow",
   headers:{"Accept":"application/json"}
  });
  if(!response.ok)throw new Error(response.status===401||response.status===403?"Your HEI admin login is required.":"Authentication check returned HTTP "+response.status+".");
  const type=response.headers.get("content-type")||"";
  if(!type.includes("application/json"))throw new Error("Sign in again through Cloudflare Access before opening the admin editor.");
  const result=await response.json();
  if(result.authenticated!==true)throw new Error("This account is not authorized to edit the site.");
  window.heiAdminAuthenticated=true;
  gate.hidden=true;
  app.hidden=false;
 }catch(error){
  gate.hidden=false;
  app.hidden=true;
  window.heiAdminAuthenticated=false;
  if(message)message.textContent=(error.message||"Unable to verify your login.")+" Use Sign in / reconnect, then check again.";
 }finally{verifying=false;}
}
retry?.addEventListener("click",verifySession);
// Re-check when returning after leaving the tab (for example, after logging out).
document.addEventListener("visibilitychange",()=>{if(!document.hidden)verifySession();});
verifySession();
})();