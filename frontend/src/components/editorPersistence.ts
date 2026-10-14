export interface DraftStorage{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void}
export const draftKey=(id:string)=>'kzdoc:draft:'+id;
export const nativeDraftKey=(id:string)=>'kzdoc:native-draft:'+id;
export function preserveDraft(storage:DraftStorage,id:string,content:string){storage.setItem(draftKey(id),content)}
export function recoverDraft(storage:DraftStorage,id:string){return storage.getItem(draftKey(id))}
export function clearDraft(storage:DraftStorage,id:string){storage.removeItem(draftKey(id))}

export async function saveWithDraftFallback<T>(storage:DraftStorage,id:string,content:string,save:()=>Promise<T>,isSuccessful:(result:T)=>boolean=()=>true):Promise<T>{try{const result=await save();if(isSuccessful(result))clearDraft(storage,id);else preserveDraft(storage,id,content);return result}catch(error){preserveDraft(storage,id,content);throw error}}

/** Store the canonical native payload alongside the HTML recovery projection. */
export function preserveNativeDraft(storage:DraftStorage,id:string,payload:string){storage.setItem(nativeDraftKey(id),payload)}
export function recoverNativeDraft(storage:DraftStorage,id:string){return storage.getItem(nativeDraftKey(id))}
export function clearNativeDraft(storage:DraftStorage,id:string){storage.removeItem(nativeDraftKey(id))}

/** Prefer a recoverable local Kortex payload over the last server version. */
export function resolveNativeDraftPayload(localPayload:string|null,persistedPayload:string|null|undefined,isValid:(payload:string)=>boolean=()=>true):string|null{
  if(localPayload!==null&&isValid(localPayload))return localPayload;
  if(typeof persistedPayload==='string'&&isValid(persistedPayload))return persistedPayload;
  return null;
}
