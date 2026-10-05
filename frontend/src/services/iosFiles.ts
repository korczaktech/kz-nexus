const DB_NAME = "korczak-nexus-ios";
const STORE = "files";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:"id"});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error("Não foi possível abrir o armazenamento local."));
  });
}

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

export async function pickIOSFiles(): Promise<File[]> {
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
