import {authorize,respond} from "../_lib/secure.js";

// Lightweight server-side session check. Never trust a client-side login flag.
export async function onRequestGet({request,env}) {
  const denied=await authorize(request,env);
  if(denied)return denied;
  return respond({authenticated:true});
}
