const DB_NAME="korczak-nexus-ios";
const STORE="syncQueue";
const DB_VERSION=2;

export type IOSQueuedOperation={
  id:string;
  method:string;
  path:string;
  body?:string;
  createdAt:number;
  attempts:number;
};

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("files")) db.createObjectStore("files",{keyPath:"id"});
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:"id"});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Não foi possível abrir o armazenamento local."));
  });
}

export async function queueIOSOperation(method:string,path:string,body?:string):Promise<void>{
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put({id:crypto.randomUUID(),method,path,body,createdAt:Date.now(),attempts:0} satisfies IOSQueuedOperation);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Não foi possível guardar a alteração offline."));
  });
  db.close();
  window.dispatchEvent(new CustomEvent("nexusIOSSyncQueued"));
}

async function listQueue():Promise<IOSQueuedOperation[]>{
  const db=await openDb();
  const rows=await new Promise<IOSQueuedOperation[]>((resolve,reject)=>{
    const req=db.transaction(STORE,"readonly").objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
  db.close();
  return rows.sort((a,b)=>a.createdAt-b.createdAt);
}

async function remove(id:string):Promise<void>{
  const db=await openDb();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).delete(id);
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);
  });
  db.close();
}

export async function pendingIOSOperations():Promise<number>{ return (await listQueue()).length; }

export async function flushIOSOperationQueue(base:string,getToken:()=>string|null):Promise<{synced:number;pending:number}>{
  if(!navigator.onLine) return {synced:0,pending:await pendingIOSOperations()};
  let synced=0;
  for(const op of await listQueue()){
    const headers=new Headers();
    if(op.body!==undefined) headers.set("Content-Type","application/json");
    const token=getToken(); if(token) headers.set("Authorization","Bearer "+token);
    try{
      const response=await fetch(base.replace(/\/$/,"")+op.path,{method:op.method,headers,body:op.body});
      if(response.ok || (response.status>=400 && response.status<500 && response.status!==409)){
        await remove(op.id); synced++; continue;
      }
      break;
    }catch{ break; }
  }
  const pending=await pendingIOSOperations();
  window.dispatchEvent(new CustomEvent("nexusIOSSyncChanged",{detail:{synced,pending}}));
  return {synced,pending};
}
