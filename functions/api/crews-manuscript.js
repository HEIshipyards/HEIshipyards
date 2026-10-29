import {authorize,respond,errorResult} from "../_lib/secure.js";

const REPO = "HEIshipyards/HEIshipyards";
const PATH = "data/crews-manuscript.json";
const BRANCH = "main";

function decode(base64) {
  const bytes = Uint8Array.from(atob(base64.replace(/\s/g,"")), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encode(value) {
  const bytes = new TextEncoder().encode(value);
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(result);
}
async function github(env, method="GET", body=null) {
  const url="https://api.github.com/repos/"+REPO+"/contents/"+PATH+(method==="GET"?"?ref="+BRANCH:"");
  const response=await fetch(url,{
    method,
    headers:{
      Authorization:"Bearer "+env.GITHUB_TOKEN,
      Accept:"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "User-Agent":"HEI-Crews-Archive-Editor",
      ...(body?{"Content-Type":"application/json"}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok) {
    const status=[409,422].includes(response.status)?409:502;
    throw Object.assign(Error("GitHub archive request failed ("+response.status+")."),{status});
  }
  return response.json();
}
function validate(doc) {
  if(!doc||typeof doc!=="object"||Array.isArray(doc)||!Array.isArray(doc.chapters)||
     doc.chapters.length<1||doc.chapters.length>120) return "Include between 1 and 120 chapters.";
  const numbers=new Set();
  let total=0;
  for(const chapter of doc.chapters) {
    if(!chapter||!Number.isInteger(chapter.number)||chapter.number<1||chapter.number>9999||
       numbers.has(chapter.number))return "Each chapter needs a unique positive chapter number.";
    numbers.add(chapter.number);
    if(typeof chapter.title!=="string"||!chapter.title.trim()||chapter.title.length>180)
      return "Each chapter needs a name (up to 180 characters).";
    if(typeof chapter.text!=="string"||!chapter.text.trim())
      return "Each chapter needs body text.";
    if(chapter.text.length>240000)return "An individual chapter is too large.";
    total+=chapter.text.length;
  }
  if(total>750000)return "Manuscript exceeds the 750,000-character maximum.";
  return null;
}
export async function onRequestGet({request,env}) {
  const denied=await authorize(request,env);
  if(denied)return denied;
  try {
    const f=await github(env);
    return respond({manuscript:JSON.parse(decode(f.content)),version:f.sha});
  } catch(error) { return errorResult(error); }
}
export async function onRequestPut({request,env}) {
  const denied=await authorize(request,env);
  if(denied)return denied;
  if(Number(request.headers.get("content-length")||0)>1150000)
    return respond({error:"Manuscript upload exceeds the maximum size."},413);
  let input;
  try {input=await request.json();}catch(_){return respond({error:"Invalid JSON body."},400);}
  if(!input||typeof input.version!=="string"||!/^[a-f0-9]{40}$/.test(input.version))
    return respond({error:"Invalid archive version; reload before publishing."},400);
  const problem=validate(input.manuscript);
  if(problem)return respond({error:problem},400);
  const inputDoc=input.manuscript;
  const manuscript={
    title:"Crews of the Almagest",
    status:"WORK IN PROGRESS",
    note:"Draft manuscript. Sections may change as the story develops.",
    source:typeof inputDoc.source==="string"?inputDoc.source.slice(0,240):"HEI archive editor",
    chapters:inputDoc.chapters.map(chapter=>({
      number:chapter.number,
      title:chapter.title.trim(),
      text:chapter.text.replace(/\r\n?/g,"\n").trim()
    }))
  };
  const content=JSON.stringify(manuscript,null,2)+"\n";
  if(new TextEncoder().encode(content).length>1050000)
    return respond({error:"The assembled archive is too large."},413);
  try{
    const current=await github(env);
    if(current.sha!==input.version)
      return respond({error:"The archive changed since you opened it. Copy your changes and reload before publishing."},409);
    const saved=await github(env,"PUT",{
      branch:BRANCH,
      sha:current.sha,
      content:encode(content),
      message:"HEI Admin: update Crews of the Almagest manuscript"
    });
    return respond({ok:true,version:saved.content?.sha||"",manuscript});
  }catch(error){return errorResult(error);}
}
