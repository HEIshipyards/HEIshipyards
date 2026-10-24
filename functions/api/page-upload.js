import {authorize, respond, saveImage, errorResult} from "../_lib/secure.js";
function extension(bytes) {
 if (bytes.length>=8 && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71 &&
     bytes[4]===13 && bytes[5]===10 && bytes[6]===26 && bytes[7]===10) return "png";
 if (bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "jpg";
 if (bytes.length>=12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF" &&
     String.fromCharCode(...bytes.slice(8,12))==="WEBP") return "webp";
 return null;
}
export async function onRequestPost({request,env}){
 const denied=await authorize(request,env);
 if(denied)return denied;
 if(Number(request.headers.get("content-length")||0)>5_300_000)return respond({error:"Image must be under 3.5 MB."},413);
 let input;try{input=await request.json();}catch{return respond({error:"Invalid image request."},400);}
 if(!input || !["lore","crews"].includes(input.page) || typeof input.base64!=="string" ||
    input.base64.length>4_800_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.base64))
   return respond({error:"Invalid page image."},400);
 try{
  const bytes=Uint8Array.from(atob(input.base64),x=>x.charCodeAt(0));
  if(bytes.length<100||bytes.length>3_500_000)return respond({error:"Image must be under 3.5 MB."},413);
  const ext=extension(bytes);if(!ext)return respond({error:"Only JPEG, PNG and WebP images are supported."},415);
  const path="assets/articles/"+input.page+"/"+crypto.randomUUID().replace(/-/g,"")+"."+ext;
  await saveImage(env,path,input.base64,"article "+input.page);
  return respond({url:"/"+path});
 }catch(error){return errorResult(error);}
}
