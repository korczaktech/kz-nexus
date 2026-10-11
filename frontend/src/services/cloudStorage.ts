import * as mammoth from "mammoth";
import {htmlToGoogleDocsPayload} from "./googleDocsFormatting";
import {normalizeHtmlForDocx} from "../components/editorFormats";
export type CloudProvider="google-drive";
export interface CloudFile{id:string;name:string;mimeType:string;size?:string;modifiedTime?:string;parents?:string[];webViewLink?:string;iconLink?:string;}
type CloudSession={provider:CloudProvider;accessToken:string;refreshToken?:string;expiresAt:number;account?:string;rootFolderId?:string};
const KEY="kz_cloud_sessions_v2";
function read():Partial<Record<CloudProvider,CloudSession>>{try{return JSON.parse(localStorage.getItem(KEY)||"{}")}catch{return {}}}
function write(v:Partial<Record<CloudProvider,CloudSession>>){localStorage.setItem(KEY,JSON.stringify(v))}
export function getCloudSession(provider:CloudProvider){return read()[provider]||null}
export function disconnectCloud(provider:CloudProvider){const all=read();delete all[provider];write(all)}
function b64url(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
async function pkce(){const bytes=crypto.getRandomValues(new Uint8Array(32));const verifier=b64url(bytes);const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier));return{verifier,challenge:b64url(new Uint8Array(hash))}}
let runtimeClientId="";
function redirectUri(){const configured=String(import.meta.env.VITE_GOOGLE_REDIRECT_URI||"").trim();return configured||location.origin+location.pathname}
async function clientId(){if(runtimeClientId)return runtimeClientId;const buildId=import.meta.env.VITE_GOOGLE_CLIENT_ID;if(buildId){runtimeClientId=String(buildId).trim();return runtimeClientId}throw new Error("Google Drive não configurado: defina GOOGLE_CLIENT_ID nas variáveis ou secrets do repositório GitHub. O workflow de publicação converte esse valor em VITE_GOOGLE_CLIENT_ID durante o build. Depois, execute novamente a publicação do GitHub Pages.");}
async function cfg(){const id=await clientId();return{clientId:id,auth:"https://accounts.google.com/o/oauth2/v2/auth",api:(import.meta.env.VITE_API_BASE_URL||"https://kzdoc.onrender.com").replace(/\/$/,""),scope:"openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents"}}
export async function connectCloud(){const c=await cfg();if(!c.clientId)throw new Error("Google Drive ainda não possui Client ID configurado na NexusAPI.");const{verifier,challenge}=await pkce();const state=b64url(crypto.getRandomValues(new Uint8Array(24)));sessionStorage.setItem("nexus_oauth",JSON.stringify({provider:"google-drive",state,verifier}));const url=new URL(c.auth);url.searchParams.set("client_id",c.clientId);url.searchParams.set("response_type","code");url.searchParams.set("redirect_uri",redirectUri());url.searchParams.set("scope",c.scope);url.searchParams.set("state",state);url.searchParams.set("code_challenge",challenge);url.searchParams.set("code_challenge_method","S256");url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");location.assign(url.toString())}
export async function finishCloudOAuth(){const q=new URLSearchParams(location.search);const oauthError=q.get("error");if(oauthError){sessionStorage.removeItem("nexus_oauth");history.replaceState({},document.title,location.pathname);throw new Error(oauthError==="access_denied"?"A autorização do Google Drive foi cancelada.":"O Google recusou a autorização do Drive: "+oauthError)}const code=q.get("code"),state=q.get("state");if(!code&&!state)return null;if(!code||!state)throw new Error("Resposta OAuth incompleta do Google Drive. Confira a URL de redirecionamento autorizada no Google Cloud Console.");let pending:null|{provider:CloudProvider;state:string;verifier:string}=null;try{pending=JSON.parse(sessionStorage.getItem("nexus_oauth")||"null")}catch{}if(!pending||pending.state!==state||pending.provider!=="google-drive")throw new Error("A sessão de autorização do Google Drive não confere. Recarregue o Nexus e tente conectar novamente.");const c=await cfg();if(!c.clientId)throw new Error("Google Drive ainda não possui Client ID configurado na NexusAPI.");const r=await fetch(c.api+"/api/v1/oauth/google/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,redirect_uri:redirectUri(),code_verifier:pending.verifier})});if(!r.ok){let detail="";try{const d=await r.json();detail=String(d.detail||d.error?.message||d.error_description||d.error||"")}catch{}throw new Error("Falha ao trocar o código OAuth por token"+(detail?": "+detail:"")+". Confira GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Render e a URL de redirecionamento no Google Cloud Console.")}const data=await r.json();if(!data.access_token)throw new Error("O Google não retornou access_token. Verifique o consentimento OAuth e o projeto Google Cloud.");const session={provider:"google-drive" as const,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};const all=read();all["google-drive"]=session;write(all);sessionStorage.removeItem("nexus_oauth");history.replaceState({},document.title,location.pathname);return"google-drive" as const}
async function refresh(s:CloudSession){if(!s.refreshToken)return s;const c=await cfg();const r=await fetch(c.api+"/api/v1/oauth/google/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.refreshToken})});if(!r.ok){disconnectCloud("google-drive");throw new Error("A autorização do Google Drive expirou ou o servidor OAuth não está configurado. Conecte a conta novamente.")}const data=await r.json();const next={...s,accessToken:data.access_token,refreshToken:data.refresh_token||s.refreshToken,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};const all=read();all["google-drive"]=next;write(all);return next}
async function request(url:string,init:RequestInit={}){let s=getCloudSession("google-drive");if(!s)throw new Error("Conecte seu Google Drive primeiro.");if(Date.now()>s.expiresAt-60000)s=await refresh(s);const h=new Headers(init.headers);h.set("Authorization","Bearer "+s.accessToken);let r=await fetch(url,{...init,headers:h});if(r.status===401&&s.refreshToken){s=await refresh(s);h.set("Authorization","Bearer "+s.accessToken);r=await fetch(url,{...init,headers:h})}if(!r.ok)throw new Error("O Google Drive recusou a operação ("+r.status+").");return r}
async function ensureRootFolder(){
  const s=getCloudSession("google-drive");
  if(!s)throw new Error("Conecte seu Google Drive primeiro.");
  if(s.rootFolderId){try{const r=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(s.rootFolderId)+"?fields=id,name,mimeType,trashed");const f=await r.json();if(f.mimeType==="application/vnd.google-apps.folder"&&!f.trashed)return f}catch{}}
  const q=encodeURIComponent("name = 'Korczak Nexus' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents");
  const found=await request("https://www.googleapis.com/drive/v3/files?spaces=drive&pageSize=10&fields=files(id,name,mimeType,parents)&q="+q);
  const data=await found.json();
  if(data.files?.[0]){const all=read();all["google-drive"]={...s,rootFolderId:data.files[0].id};write(all);return data.files[0]}
  const created=await request("https://www.googleapis.com/drive/v3/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"Korczak Nexus",mimeType:"application/vnd.google-apps.folder",parents:["root"]})});
  const folder=await created.json();const all=read();all["google-drive"]={...s,rootFolderId:folder.id};write(all);return folder;
}
export async function listCloudFiles(folderId?:string):Promise<{files:CloudFile[];nextPageToken?:string}>{
  const s=getCloudSession("google-drive");
  if(!s)throw new Error("Conecte seu Google Drive primeiro.");
  const files:CloudFile[]=[];
  let pageToken="";
  do{
    const params=new URLSearchParams({spaces:"drive",pageSize:"1000",orderBy:"folder,name",fields:"nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink,iconLink)",q:folderId?"'"+folderId+"' in parents and trashed=false":"trashed=false"});
    if(pageToken)params.set("pageToken",pageToken);
    const r=await request("https://www.googleapis.com/drive/v3/files?"+params.toString());
    const data=await r.json();
    files.push(...(Array.isArray(data.files)?data.files:[]));
    pageToken=data.nextPageToken||"";
  }while(pageToken);
  return {files};
}

export async function readCloudFile(file:CloudFile):Promise<{content:string;document_type:string}>{
  const docs="application/vnd.google-apps.document";
  const sheets="application/vnd.google-apps.spreadsheet";
  const slides="application/vnd.google-apps.presentation";
  const docx="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="docx"||file.mimeType===docx){
    const response=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media");
    const arrayBuffer=await response.arrayBuffer();
    try{
      const result=await mammoth.convertToHtml({arrayBuffer});
      const html=String(result.value||"").trim();
      if(!html.replace(/<[^>]*>/g,"").trim())throw new Error("O DOCX não contém texto extraível.");
      return {content:html,document_type:"html"};
    }catch(error){
      if(error instanceof Error&&error.message==="O DOCX não contém texto extraível.")throw error;
      throw new Error("Não foi possível ler este DOCX. Verifique se o arquivo não está corrompido ou protegido por senha.");
    }
  }
  let url:string;
  let type="txt";
  if(file.mimeType===docs){
    url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"/export?mimeType="+encodeURIComponent("text/html");
    type="html";
  }else if(file.mimeType===sheets){
    url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"/export?mimeType="+encodeURIComponent("text/csv");
    type="csv";
  }else if(file.mimeType===slides){
    url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"/export?mimeType="+encodeURIComponent("text/plain");
  }else{
    const supported=["txt","md","markdown","csv","json","html","htm","xml","rtf","css","js","ts","tsx","jsx","py","yml","yaml","log","svg","ini","toml","sql"];
    if(!supported.includes(ext)&&!file.mimeType.startsWith("text/")&&file.mimeType!=="application/json"){
      throw new Error("Este formato ("+(ext||file.mimeType)+") não pode ser convertido em texto editável. PDF e imagens exigem importadores específicos.");
    }
    type=ext==="markdown"?"md":(ext||"txt");
    url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"?alt=media";
  }
  const response=await request(url);
  const content=await response.text();
  if(!content.trim())throw new Error("O arquivo está vazio ou não contém texto editável.");
  return {content,document_type:type};
}

export async function saveCloudFile(file:CloudFile,content:string):Promise<void>{
  if(!content.trim())throw new Error("O documento não pode ser salvo vazio.");
  const docs="application/vnd.google-apps.document";
  const sheets="application/vnd.google-apps.spreadsheet";
  const slides="application/vnd.google-apps.presentation";
  const docx="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const htmlToText=(html:string)=>{const parsed=new DOMParser().parseFromString(html,"text/html");parsed.querySelectorAll("script,style").forEach(n=>n.remove());return (parsed.body.textContent||"").replace(/\u00a0/g," ")};
  if(file.mimeType===docs){
    const converted=htmlToGoogleDocsPayload(content);
    const response=await request("https://docs.googleapis.com/v1/documents/"+encodeURIComponent(file.id));
    const document=await response.json();
    const endIndex=Number(document.body?.content?.[document.body.content.length-1]?.endIndex||1);
    const requests:any[]=[];
    if(endIndex>2)requests.push({deleteContentRange:{range:{startIndex:1,endIndex:endIndex-1}}});
    if(converted.text)requests.push({insertText:{location:{index:1},text:converted.text}});
    requests.push(...converted.requests);
    if(requests.length)await request("https://docs.googleapis.com/v1/documents/"+encodeURIComponent(file.id)+":batchUpdate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests})});
    return;
  }
  if(file.mimeType===sheets||file.mimeType===slides){
    throw new Error("A cópia do Nexus foi salva, mas a sincronização de planilhas e apresentações nativas do Google ainda exige sincronizadores específicos.");
  }
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="docx"||file.mimeType===docx){
    const mod=await import("html-to-docx");
    const convert=(mod as any).default||mod;
    const blob=await convert("<html><body>"+normalizeHtmlForDocx(content)+"</body></html>",null,{});
    await request("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(file.id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":docx},body:blob instanceof Blob?blob:new Blob([blob],{type:docx})});
    return;
  }
  const supported=["txt","md","markdown","csv","json","html","htm","xml","rtf","css","js","ts","tsx","jsx","py","yml","yaml","log","svg","ini","toml","sql"];
  if(!supported.includes(ext)&&!file.mimeType.startsWith("text/")&&file.mimeType!=="application/json"){
    throw new Error("A cópia do Nexus foi salva, mas este formato não pode ser sincronizado diretamente.");
  }
  const payload=ext==="html"||ext==="htm"?content:htmlToText(content);
  await request("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(file.id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":file.mimeType.startsWith("text/")?file.mimeType:"text/plain"},body:payload});
}

export async function createCloudFolder(name:string,parentId?:string){const root=await ensureRootFolder();const parent=parentId||root.id;const r=await request("https://www.googleapis.com/drive/v3/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parent]})});return r.json()}