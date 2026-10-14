import {describe,expect,it} from 'vitest';
import {clearDraft,draftKey,preserveDraft,recoverDraft,saveWithDraftFallback,clearNativeDraft,nativeDraftKey,preserveNativeDraft,recoverNativeDraft,resolveNativeDraftPayload,type DraftStorage} from './editorPersistence';

function storage():DraftStorage{
  const data=new Map<string,string>();
  return {
    getItem:key=>data.get(key)||null,
    setItem:(key,value)=>{data.set(key,value)},
    removeItem:key=>{data.delete(key)}
  };
}

describe('proteção de rascunho da Fase 8',()=>{
  it('preserva o conteúdo quando o salvamento é interrompido',()=>{
    const s=storage();
    preserveDraft(s,'doc-1','conteúdo que não pode ser perdido');
    expect(recoverDraft(s,'doc-1')).toBe('conteúdo que não pode ser perdido');
  });

  it('remove o rascunho depois de uma confirmação de salvamento',()=>{
    const s=storage();
    preserveDraft(s,'doc-2','salvo');
    clearDraft(s,'doc-2');
    expect(recoverDraft(s,'doc-2')).toBeNull();
    expect(draftKey('doc-2')).toBe('kzdoc:draft:doc-2');
  });

  it('preserva o rascunho quando o salvamento falha',async()=>{
    const s=storage();
    await expect(saveWithDraftFallback(s,'doc-3','conteúdo pendente',async()=>{throw new Error('falha de rede')})).rejects.toThrow('falha de rede');
    expect(recoverDraft(s,'doc-3')).toBe('conteúdo pendente');
  });

  it('preserva o rascunho quando o servidor devolve conflito',async()=>{
    const s=storage();
    const result=await saveWithDraftFallback(s,'doc-4','alteração local',async()=> 'conflict',value=>value==='saved');
    expect(result).toBe('conflict');
    expect(recoverDraft(s,'doc-4')).toBe('alteração local');
  });
  it('prioriza o rascunho nativo local mesmo sem um rascunho HTML',()=>{
    const local='payload-local-nsx';
    const server='payload-servidor-nsx';
    expect(resolveNativeDraftPayload(local,server)).toBe(local);
    expect(resolveNativeDraftPayload(null,server)).toBe(server);
    expect(resolveNativeDraftPayload(null,null)).toBeNull();
  });
  it('preserva e remove o payload nativo do Kortex separadamente do HTML',()=>{
    const s=storage();
    preserveDraft(s,'doc-native','<p>Projeção HTML</p>');
    preserveNativeDraft(s,'doc-native','{"format":"korczak-nexus","document":{}}');
    expect(recoverDraft(s,'doc-native')).toBe('<p>Projeção HTML</p>');
    expect(recoverNativeDraft(s,'doc-native')).toBe('{"format":"korczak-nexus","document":{}}');
    expect(nativeDraftKey('doc-native')).toBe('kzdoc:native-draft:doc-native');
    clearNativeDraft(s,'doc-native');
    expect(recoverNativeDraft(s,'doc-native')).toBeNull();
  });
});
