const DB_NAME = "korczak-nexus-ios";
const STORE = "files";
const DB_VERSION = 2;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{ const db=request.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"id"}); if(!db.objectStoreNames.contains("syncQueue")) db.createObjectStore("syncQueue",{keyPath:"id"}); };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Não foi possível abrir o armazenamento local."));
  });
}

function notifyIOSFilesChanged(){ window.dispatchEvent(new CustomEvent("nexusIOSFilesChanged")); }

export async function cacheIOSFile(file: File): Promise<string> {
  const id=`${Date.now()}-${crypto.randomUUID()}`;
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put({id,name:file.name,type:file.type,size:file.size,lastModified:file.lastModified,blob:file});
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Não foi possível guardar o arquivo no dispositivo."));
  });
  db.close();
  notifyIOSFilesChanged();
  return id;
}

export async function listIOSFiles(): Promise<Array<{id:string;name:string;type:string;size:number;lastModified:number}>> {
  const db=await openDb();
  const rows=await new Promise<any[]>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly"), req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  return rows.map(({id,name,type,size,lastModified})=>({id,name,type,size,lastModified}));
}

export async function getIOSFile(id:string): Promise<File | null> {
  const db=await openDb();
  const row=await new Promise<any>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly"), req=tx.objectStore(STORE).get(id);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  return row?.blob instanceof File ? row.blob : row?.blob instanceof Blob
    ? new File([row.blob], row.name || "arquivo", {type:row.type || row.blob.type || "application/octet-stream", lastModified:row.lastModified || Date.now()})
    : null;
}

export async function deleteIOSFile(id:string): Promise<void> {
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

export async function shareIOSFile(file: File): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (nav.share) {
    const data: ShareData = { title: "Korczak Nexus", text: file.name, files: [file] };
    try {
      if (!nav.canShare || nav.canShare(data)) { await nav.share(data); return true; }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return true;
    }
  }
  if (!hasNativeIOSBridge()) return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i,i+chunk));
  (window as Window & {webkit?: {messageHandlers?: {ios?: {postMessage?: (body: unknown)=>void}}}}).webkit?.messageHandlers?.ios?.postMessage?.({
    action:"share", name:file.name, mime:file.type || "application/octet-stream", base64:btoa(binary)
  });
  return true;
}

export function hasNativeIOSBridge(): boolean {
  return Boolean((window as Window & {webkit?: {messageHandlers?: {ios?: {postMessage?: (body: unknown)=>void}}}}).webkit?.messageHandlers?.ios?.postMessage);
}

async function pickWithNativeIOSBridge(): Promise<File[]> {
  return new Promise((resolve,reject)=>{
    const timeout=window.setTimeout(()=>{cleanup();reject(new Error("O seletor de Arquivos do iOS não respondeu."));},60000);
    const onOpen=(event:Event)=>{
      const detail=(event as CustomEvent<{name?:string;mime?:string;base64?:string}>).detail;
      if(!detail?.base64||!detail.name){cleanup();resolve([]);return;}
      try {
        const bytes=Uint8Array.from(atob(detail.base64),char=>char.charCodeAt(0));
        const file=new File([bytes],detail.name,{type:detail.mime||"application/octet-stream"});
        cacheIOSFile(file).then(()=>{cleanup();resolve([file]);}).catch(error=>{cleanup();reject(error);});
      } catch(error){cleanup();reject(error);}
    };
    const onError=()=>{cleanup();reject(new Error("Não foi possível abrir o arquivo pelo Arquivos do iOS."));};
    const cleanup=()=>{window.clearTimeout(timeout);window.removeEventListener("ios-document-open",onOpen);window.removeEventListener("ios-document-error",onError);};
    window.addEventListener("ios-document-open",onOpen,{once:true});
    window.addEventListener("ios-document-error",onError,{once:true});
    (window as Window & {webkit?: {messageHandlers?: {ios?: {postMessage?: (body: unknown)=>void}}}}).webkit?.messageHandlers?.ios?.postMessage?.({action:"pickFile"});
  });
}

export async function pickIOSFiles(): Promise<File[]> {
  if(hasNativeIOSBridge()) return pickWithNativeIOSBridge();
  return new Promise((resolve,reject)=>{
    const input=document.createElement("input");
    input.type="file";
    input.multiple=true;
    input.accept=".doc,.docx,.pdf,.txt,.rtf,.md,.odt,.csv,.json,image/*";
    input.style.display="none";
    input.addEventListener("change",async()=>{
      try {
        const files=Array.from(input.files||[]);
        for(const file of files) await cacheIOSFile(file);
        resolve(files);
      } catch(error) { reject(error); }
      finally { input.remove(); }
    },{once:true});
    input.addEventListener("cancel",()=>{input.remove();resolve([])},{once:true});
    document.body.appendChild(input);
    input.click();
  });
}
