import "./browserGlobals";
import {htmlToGoogleDocsPayload} from "./googleDocsFormatting";
import {normalizeHtmlForDocx} from "../components/editorFormats";
import {stripLayoutMetadata} from "../components/editorLayoutMetadata";
import {htmlToPlainText,htmlToSpreadsheetTables} from "./googleSheetsFormatting";
import {escapeSlideHtml,htmlToSlideParagraphs,htmlToSlideTextBoxes,slideShapeText} from "./googleSlidesFormatting";
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
async function cfg(){const id=await clientId();return{clientId:id,auth:"https://accounts.google.com/o/oauth2/v2/auth",api:(import.meta.env.VITE_API_BASE_URL||"https://kzdoc.onrender.com").replace(/\/$/,""),scope:"openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/presentations"}}
export async function connectCloud(){const c=await cfg();if(!c.clientId)throw new Error("Google Drive ainda não possui Client ID configurado na NexusAPI.");const{verifier,challenge}=await pkce();const state=b64url(crypto.getRandomValues(new Uint8Array(24)));sessionStorage.setItem("nexus_oauth",JSON.stringify({provider:"google-drive",state,verifier}));const url=new URL(c.auth);url.searchParams.set("client_id",c.clientId);url.searchParams.set("response_type","code");url.searchParams.set("redirect_uri",redirectUri());url.searchParams.set("scope",c.scope);url.searchParams.set("state",state);url.searchParams.set("code_challenge",challenge);url.searchParams.set("code_challenge_method","S256");url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");location.assign(url.toString())}
export async function finishCloudOAuth(){const q=new URLSearchParams(location.search);const oauthError=q.get("error");if(oauthError){sessionStorage.removeItem("nexus_oauth");history.replaceState({},document.title,location.pathname);throw new Error(oauthError==="access_denied"?"A autorização do Google Drive foi cancelada.":"O Google recusou a autorização do Drive: "+oauthError)}const code=q.get("code"),state=q.get("state");if(!code&&!state)return null;if(!code||!state)throw new Error("Resposta OAuth incompleta do Google Drive. Confira a URL de redirecionamento autorizada no Google Cloud Console.");let pending:null|{provider:CloudProvider;state:string;verifier:string}=null;try{pending=JSON.parse(sessionStorage.getItem("nexus_oauth")||"null")}catch{}if(!pending||pending.state!==state||pending.provider!=="google-drive")throw new Error("A sessão de autorização do Google Drive não confere. Recarregue o Nexus e tente conectar novamente.");const c=await cfg();if(!c.clientId)throw new Error("Google Drive ainda não possui Client ID configurado na NexusAPI.");const r=await fetch(c.api+"/api/v1/oauth/google/token",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code,redirect_uri:redirectUri(),code_verifier:pending.verifier})});if(!r.ok){let detail="";try{const d=await r.json();detail=String(d.detail||d.error?.message||d.error_description||d.error||"")}catch{}throw new Error("Falha ao trocar o código OAuth por token"+(detail?": "+detail:"")+". Confira GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Render e a URL de redirecionamento no Google Cloud Console.")}const data=await r.json();if(!data.access_token)throw new Error("O Google não retornou access_token. Verifique o consentimento OAuth e o projeto Google Cloud.");const session={provider:"google-drive" as const,accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};const all=read();all["google-drive"]=session;write(all);sessionStorage.removeItem("nexus_oauth");history.replaceState({},document.title,location.pathname);return"google-drive" as const}
async function refresh(s:CloudSession){if(!s.refreshToken)return s;const c=await cfg();const r=await fetch(c.api+"/api/v1/oauth/google/refresh",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({refresh_token:s.refreshToken})});if(!r.ok){disconnectCloud("google-drive");throw new Error("A autorização do Google Drive expirou ou o servidor OAuth não está configurado. Conecte a conta novamente.")}const data=await r.json();const next={...s,accessToken:data.access_token,refreshToken:data.refresh_token||s.refreshToken,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};const all=read();all["google-drive"]=next;write(all);return next}
const waitForRetry=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url:string,init:RequestInit={}){
  let session=getCloudSession("google-drive");
  if(!session)throw new Error("Conecte seu Google Drive primeiro.");
  if(Date.now()>session.expiresAt-60000)session=await refresh(session);
  const method=(init.method||"GET").toUpperCase();
  let refreshed=false;
  for(let attempt=0;attempt<3;attempt++){
    const headers=new Headers(init.headers);headers.set("Authorization","Bearer "+session.accessToken);
    const response=await fetch(url,{...init,headers});
    if(response.status===401&&session.refreshToken&&!refreshed){session=await refresh(session);refreshed=true;attempt--;continue}
    if((response.status===429||(method==="GET"&&response.status>=500))&&attempt<2){
      const seconds=Number(response.headers.get("Retry-After")||0);
      await waitForRetry(seconds>0?Math.min(2000,seconds*1000):200*(attempt+1));continue;
    }
    if(!response.ok){
      if(response.status===429)throw new Error("O Google Drive limitou temporariamente as solicitações. Aguarde e tente novamente.");
      let detail="";let reason="";
      try{
        const payload=await response.clone().json();
        const error=payload?.error;
        detail=String(error?.message||payload?.message||"").trim();
        const errors=Array.isArray(error?.errors)?error.errors:[];
        reason=String(errors[0]?.reason||error?.status||"").trim();
        if(!reason&&Array.isArray(error?.details))reason=String(error.details[0]?.reason||error.details[0]?.metadata?.reason||"").trim();
      }catch{}
      const operation=method+" "+new URL(url).pathname;
      throw new Error("O Google Drive recusou a operação ("+response.status+")"+(reason?" ["+reason+"]":"")+(detail?": "+detail:"")+" — "+operation+". Verifique se as APIs e permissões necessárias estão habilitadas no projeto Google Cloud.");
    }
    return response;
  }
  throw new Error("O Google Drive permaneceu indisponível após várias tentativas. Tente novamente em instantes.");
}
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
export async function createCloudBackup(name:string,content:string):Promise<CloudFile>{
  const session=getCloudSession("google-drive");
  if(!session)throw new Error("Nenhuma sessão do Google Drive está conectada.");
  const folder=await ensureRootFolder();
  const safeName=(name.trim().replace(/[\\/\\x00-\\x1f]/g,"_").slice(0,220)||"documento")+(name.toLowerCase().endsWith(".nsx")?"":".nsx");
  const boundary="nexus_"+b64url(crypto.getRandomValues(new Uint8Array(18)));
  const metadata={name:safeName,mimeType:"application/x-korczak-nexus",parents:[folder.id]};
  const body="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: application/x-korczak-nexus\r\n\r\n"+content+"\r\n--"+boundary+"--";
  const response=await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,parents,webViewLink",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
  return await response.json() as CloudFile;
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
    const blob=await response.blob();
    try{
      const renderer=await import("docx-preview");
      const renderAsync=(renderer as any).renderAsync;
      if(typeof renderAsync!=="function")throw new Error("Renderizador DOCX indisponível.");
      const host=document.createElement("div");
      host.setAttribute("aria-hidden","true");
      host.style.cssText="position:fixed;left:-100000px;top:0;width:1200px;visibility:hidden;pointer-events:none";
      document.body.appendChild(host);
      try{
        await renderAsync(await blob.arrayBuffer(),host,undefined,{inWrapper:false,ignoreWidth:false,ignoreHeight:false,ignoreFonts:false,breakPages:false,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,useBase64URL:true});
        const properties=["font-family","font-size","font-weight","font-style","font-variant","color","background-color","text-align","text-decoration","text-transform","letter-spacing","line-height","vertical-align","white-space","word-break","overflow-wrap","width","min-width","max-width","height","margin-top","margin-right","margin-bottom","margin-left","padding-top","padding-right","padding-bottom","padding-left","border-top","border-right","border-bottom","border-left","border-collapse","border-spacing","table-layout","list-style-type","text-indent"];
        host.querySelectorAll<HTMLElement>("*").forEach(element=>{
          const computed=window.getComputedStyle(element);const styles:string[]=[];
          for(const property of properties){const value=computed.getPropertyValue(property);if(value&&value!=="normal"&&value!=="none"&&value!=="rgba(0, 0, 0, 0)"&&value!=="auto")styles.push(property+":"+value)}
          element.setAttribute("style",[element.getAttribute("style")||"",...styles].filter(Boolean).join(";"));
          element.removeAttribute("class");
        });
        const html=host.innerHTML.trim();
        if(!html.replace(/<[^>]*>/g,"").trim())throw new Error("O DOCX não contém texto extraível.");
        return {content:html,document_type:"docx"};
      }finally{host.remove()}
    }catch(error){
      if(error instanceof Error&&error.message==="O DOCX não contém texto extraível.")throw error;
      throw new Error("Não foi possível ler este DOCX preservando sua formatação. Verifique se o arquivo não está corrompido ou protegido por senha.");
    }
  }
  if(file.mimeType===slides){
    const response=await request("https://slides.googleapis.com/v1/presentations/"+encodeURIComponent(file.id));
    const presentation=await response.json();
    const shapes:any[]=[];
    for(const slide of presentation.slides||[])for(const element of slide.pageElements||[])if(element.shape?.text)shapes.push({objectId:element.objectId,text:slideShapeText(element.shape)});
    const content=shapes.map(shape=>'<p data-slide-object-id="'+escapeSlideHtml(shape.objectId)+'">'+escapeSlideHtml(shape.text).replace(/\n/g,'<br>')+'</p>').join('');
    return {content,document_type:"html"};
  }
  if(file.mimeType===sheets){
    const metadataResponse=await request("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(file.id)+"?fields=sheets.properties(title,index,sheetId)");
    const metadata=await metadataResponse.json();
    const sheetsList=(metadata.sheets||[]).slice().sort((a:any,b:any)=>Number(a.properties?.index||0)-Number(b.properties?.index||0));
    if(!sheetsList.length)throw new Error("Não foi possível localizar abas nesta planilha.");
    const tables:string[]=[];
    for(const sheet of sheetsList){
      const title=String(sheet.properties?.title||"");
      const sheetId=String(sheet.properties?.sheetId??"");
      if(!title||!sheetId)throw new Error("Uma aba da planilha não possui metadados válidos.");
      const range=encodeURIComponent("'"+title.replace(/'/g,"''")+"'!A:ZZ");
      const valuesResponse=await request("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(file.id)+"/values/"+range+"?valueRenderOption=FORMULA");
      const data=await valuesResponse.json();
      const values=Array.isArray(data.values)?data.values:[];
      const rows=values.length?values.map((row:any[])=>"<tr>"+row.map(value=>{const escaped=escapeSlideHtml(String(value??""));const preserved=escaped.replace(/^ +| +$/g,spaces=>"&nbsp;".repeat(spaces.length));return "<td>"+preserved+"</td>"} ).join("")+"</tr>").join(""):"<tr><td></td></tr>";
      tables.push("<h2>"+escapeSlideHtml(title)+"</h2><table data-google-sheet-id=\""+escapeSlideHtml(sheetId)+"\" data-google-sheet-title=\""+escapeSlideHtml(title)+"\"><tbody>"+rows+"</tbody></table>");
    }
    return {content:tables.join(""),document_type:"html"};
  }
    let url:string;
  let type="txt";
  if(file.mimeType===docs){
    url="https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(file.id)+"/export?mimeType="+encodeURIComponent("text/html");
    type="html";
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
  content=stripLayoutMetadata(content);
  const docs="application/vnd.google-apps.document";
  const sheets="application/vnd.google-apps.spreadsheet";
  const slides="application/vnd.google-apps.presentation";
  const docx="application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if(file.mimeType===docs){
    if(/<img\b/i.test(content))throw new Error("A versão Nexus foi salva, mas a sincronização para o Google Docs foi interrompida para não perder imagens incorporadas. Remova as imagens ou sincronize uma versão somente de texto.");
    if(/<table\b/i.test(content))throw new Error("A versão Nexus foi salva, mas a sincronização para o Google Docs foi interrompida para não achatar tabelas. Exporte como DOCX para preservar a estrutura.");
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
  if(file.mimeType===sheets){
    const metadataResponse=await request("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(file.id)+"?fields=sheets.properties(title,index,sheetId)");
    const metadata=await metadataResponse.json();
    const existing=(metadata.sheets||[]).map((sheet:any)=>({sheetId:String(sheet.properties?.sheetId??""),title:String(sheet.properties?.title||"")}));
    if(!existing.length||existing.some((sheet:any)=>!sheet.sheetId||!sheet.title))throw new Error("Não foi possível validar as abas originais da planilha.");
    const tables=htmlToSpreadsheetTables(content);
    if(tables.length!==existing.length||existing.some((sheet:any)=>!tables.some(table=>table.sheetId===sheet.sheetId)))throw new Error("A lista de abas foi alterada no Nexus. A sincronização exige todas as abas originais; reimporte a planilha para sincronizar sem perdas.");
    for(const table of tables){
      const original=existing.find((sheet:any)=>sheet.sheetId===table.sheetId);
      if(!original||original.title!==table.title)throw new Error("O nome ou identificador de uma aba foi alterado. Renomeie a aba diretamente no Google Sheets e reimporte a planilha.");
      const escapedTitle="'"+original.title.replace(/'/g,"''")+"'";
      await request("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(file.id)+"/values:batchClear",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ranges:[escapedTitle+"!A:ZZ"]})});
      const values=table.values.filter(row=>row.length>0);
      if(values.length&&values.some(row=>row.some(value=>value!=="")))await request("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(file.id)+"/values/"+encodeURIComponent(escapedTitle+"!A1")+"?valueInputOption=USER_ENTERED",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({majorDimension:"ROWS",values})});
    }
    return;
  }
    if(file.mimeType===slides){
    const response=await request("https://slides.googleapis.com/v1/presentations/"+encodeURIComponent(file.id));
    const presentation=await response.json();
    const existing=new Map<string,string>();
    for(const slide of presentation.slides||[])for(const element of slide.pageElements||[])if(element.shape?.text)existing.set(String(element.objectId),slideShapeText(element.shape));
    const boxes=htmlToSlideTextBoxes(content);
    const requests:any[]=[];
    for(const box of boxes){
      if(!existing.has(box.objectId))throw new Error("Uma caixa de texto foi removida ou alterada na apresentação original. Reimporte a apresentação antes de sincronizar para evitar sobrescrever conteúdo incorreto.");
      const previous=existing.get(box.objectId)||"";
      if(previous===box.text)continue;
      if(previous)requests.push({["delete"+"Text"]:{objectId:box.objectId,textRange:{type:"ALL"}}});
      if(box.text)requests.push({insertText:{objectId:box.objectId,insertionIndex:0,text:box.text}});
    }
    if(requests.length)await request("https://slides.googleapis.com/v1/presentations/"+encodeURIComponent(file.id)+":batchUpdate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests})});
    return;
  }
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(ext==="docx"||file.mimeType===docx){
    const mod=await import("@turbodocx/html-to-docx");
    const convert=(mod as any).default||mod;
    const blob=await convert("<html><body>"+normalizeHtmlForDocx(content)+"</body></html>",null,{});
    await request("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(file.id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":docx},body:blob instanceof Blob?blob:new Blob([blob],{type:docx})});
    return;
  }
  const supported=["txt","md","markdown","csv","json","html","htm","xml","rtf","css","js","ts","tsx","jsx","py","yml","yaml","log","svg","ini","toml","sql"];
  if(!supported.includes(ext)&&!file.mimeType.startsWith("text/")&&file.mimeType!=="application/json"){
    throw new Error("A cópia do Nexus foi salva, mas este formato não pode ser sincronizado diretamente.");
  }
  const payload=ext==="html"||ext==="htm"?content:htmlToPlainText(content);
  await request("https://www.googleapis.com/upload/drive/v3/files/"+encodeURIComponent(file.id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":file.mimeType.startsWith("text/")?file.mimeType:"text/plain"},body:payload});
}

export async function createCloudFolder(name:string,parentId?:string){const root=await ensureRootFolder();const parent=parentId||root.id;const r=await request("https://www.googleapis.com/drive/v3/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parent]})});return r.json()}