import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {saveCloudFile,type CloudFile} from './cloudStorage';

describe('Google Drive sync adapters',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  function setupFetch(handler:(url:string,init?:RequestInit)=>Response|Promise<Response>){
    window=new Window();
    vi.stubGlobal('localStorage',window.localStorage);
    vi.stubGlobal('DOMParser',window.DOMParser);
    vi.stubGlobal('Node',window.Node);
    const calls:{url:string;init?:RequestInit}[]=[];
    const mock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);calls.push({url,init});return handler(url,init);
    });
    vi.stubGlobal('fetch',mock);
    window.localStorage.setItem('kz_cloud_sessions_v2',JSON.stringify({'google-drive':{provider:'google-drive',accessToken:'test-token',expiresAt:Date.now()+3600000}}));
    return{calls,mock};
  }
  it('updates a Google Doc with inserted text and inline styles',async()=>{
    const {calls}=setupFetch(url=>url.includes('/documents/doc-1')&&!url.endsWith(':batchUpdate')?new Response(JSON.stringify({body:{content:[{endIndex:2}]}}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'doc-1',name:'Doc',mimeType:'application/vnd.google-apps.document'};
    await saveCloudFile(file,'<p>Olá <strong>mundo</strong></p>');
    const batch=calls.find(call=>call.url.endsWith(':batchUpdate'));
    expect(batch?.init?.method).toBe('POST');
    const body=JSON.parse(String(batch?.init?.body));
    expect(body.requests.some((request:any)=>request.insertText?.text==='Olá mundo\n')).toBe(true);
    expect(body.requests.some((request:any)=>request.updateTextStyle?.textStyle?.bold===true)).toBe(true);
  });
  it('does not overwrite a Google Doc when embedded images would be lost',async()=>{
    const {calls}=setupFetch(()=>new Response('{}',{status:200}));
    const file:CloudFile={id:'doc-image',name:'Image doc',mimeType:'application/vnd.google-apps.document'};
    await expect(saveCloudFile(file,'<p>Texto<img src="data:image/png;base64,AAAA" alt="foto"></p>')).rejects.toThrow('não perder imagens incorporadas');
    expect(calls).toHaveLength(0);
  });
  it('does not flatten tables when syncing a Google Doc',async()=>{
    const {calls}=setupFetch(()=>new Response('{}',{status:200}));
    const file:CloudFile={id:'doc-table',name:'Table doc',mimeType:'application/vnd.google-apps.document'};
    await expect(saveCloudFile(file,'<table><tr><td>A</td></tr></table>')).rejects.toThrow('não achatar tabelas');
    expect(calls).toHaveLength(0);
  });
  it('clears and updates the first Google Sheets tab with parsed values',async()=>{
    const {calls}=setupFetch(url=>url.includes('/spreadsheets/sheet-1?fields=')?new Response(JSON.stringify({sheets:[{properties:{title:'Dados',index:0}}]}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'sheet-1',name:'Dados',mimeType:'application/vnd.google-apps.spreadsheet'};
    await saveCloudFile(file,'<p>nome,valor</p><p>Korczak,42</p>');
    const clear=calls.find(call=>call.url.includes('values:batchClear'));
    const update=calls.find(call=>call.init?.method==='PUT');
    expect(JSON.parse(String(clear?.init?.body)).ranges).toEqual(["'Dados'!A:ZZ"]);
    expect(JSON.parse(String(update?.init?.body)).values).toEqual([['nome','valor'],['Korczak','42']]);
  });
});
