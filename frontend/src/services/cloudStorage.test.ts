import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {readCloudFile,saveCloudFile,type CloudFile} from './cloudStorage';

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
  it('imports each Google Slides text box as a separate HTML paragraph',async()=>{
    setupFetch(()=>new Response(JSON.stringify({slides:[{pageElements:[
      {objectId:'title',shape:{text:{textElements:[{textRun:{content:'Título\n'}}]}}},
      {objectId:'body',shape:{text:{textElements:[{textRun:{content:'Corpo\n'}}]}}}
    ]}]}),{status:200}));
    const file:CloudFile={id:'slides-read',name:'Deck',mimeType:'application/vnd.google-apps.presentation'};
    const result=await readCloudFile(file);
    expect(result.document_type).toBe('html');
    expect(result.content).toBe('<p data-slide-object-id="title">Título</p><p data-slide-object-id="body">Corpo</p>');
  });
  it('syncs plain text back into existing Google Slides text boxes',async()=>{
    const {calls}=setupFetch(url=>url.endsWith(':batchUpdate')?new Response('{}',{status:200}):new Response(JSON.stringify({slides:[{pageElements:[
      {objectId:'title',shape:{text:{textElements:[{textRun:{content:'Título antigo\n'}}]}}},
      {objectId:'body',shape:{text:{textElements:[{textRun:{content:'Corpo antigo\n'}}]}}}
    ]}]}),{status:200}));
    const file:CloudFile={id:'slides-save',name:'Deck',mimeType:'application/vnd.google-apps.presentation'};
    await saveCloudFile(file,'<p data-slide-object-id="body">Novo corpo</p><p data-slide-object-id="title">Novo título</p>');
    const batch=calls.find(call=>call.url.endsWith(':batchUpdate'));
    const requests=JSON.parse(String(batch?.init?.body)).requests;
    expect(requests.some((request:any)=>request.insertText?.objectId==='title'&&request.insertText?.text==='Novo título')).toBe(true);
    expect(requests.some((request:any)=>request.insertText?.objectId==='body'&&request.insertText?.text==='Novo corpo')).toBe(true);
  });

  it('refuses to sync new Slides paragraphs without a stable object ID',async()=>{
    const {calls}=setupFetch(()=>new Response(JSON.stringify({slides:[{pageElements:[
      {objectId:'title',shape:{text:{textElements:[{textRun:{content:'Título antigo\n'}}]}}}
    ]}]}),{status:200}));
    const file:CloudFile={id:'slides-new-text',name:'Deck',mimeType:'application/vnd.google-apps.presentation'};
    await expect(saveCloudFile(file,'<p data-slide-object-id="title">Título</p><p>Texto novo</p>')).rejects.toThrow(/identificador/);
    expect(calls.some(call=>call.url.endsWith(':batchUpdate'))).toBe(false);
  });
  it('imports formula cells and quoted CSV values from Google Sheets',async()=>{
    setupFetch(url=>url.includes('/spreadsheets/sheet-read?fields=')?new Response(JSON.stringify({sheets:[{properties:{title:'Dados',index:0,sheetId:1}}]}),{status:200}):new Response(JSON.stringify({values:[['Name','Formula'],['Korczak','=A1+A2'],['A, B','say "hi"']]}),{status:200}));
    const file:CloudFile={id:'sheet-read',name:'Dados',mimeType:'application/vnd.google-apps.spreadsheet'};
    const result=await readCloudFile(file);
    expect(result.document_type).toBe('html');
    expect(result.content).toContain('data-google-sheet-id="1"');
    expect(result.content).toContain('<td>=A1+A2</td>');
    expect(result.content).toContain('<td>A, B</td>');
  });
  it('allows an empty Google Sheet to be opened and cleared',async()=>{
    const {calls}=setupFetch(url=>url.includes('/spreadsheets/empty?fields=')?new Response(JSON.stringify({sheets:[{properties:{title:'Dados',index:0,sheetId:1}}]}),{status:200}):url.includes('/values/')?new Response(JSON.stringify({values:[]}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'empty',name:'Vazia',mimeType:'application/vnd.google-apps.spreadsheet'};
    const imported=await readCloudFile(file);
    expect(imported.content).toContain('data-google-sheet-id="1"');
    await saveCloudFile(file,imported.content);
    expect(calls.filter(call=>call.url.includes('values:batchClear'))).toHaveLength(1);
    expect(calls.some(call=>call.init?.method==='PUT')).toBe(false);
  });

  it('syncs every Google Sheets tab by ID even when the tables are reordered',async()=>{
    const {calls}=setupFetch(url=>url.includes('/spreadsheets/multi?fields=')?new Response(JSON.stringify({sheets:[
      {properties:{title:'Dados',index:0,sheetId:11}},
      {properties:{title:'Resumo',index:1,sheetId:22}}
    ]}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'multi',name:'Multi',mimeType:'application/vnd.google-apps.spreadsheet'};
    await saveCloudFile(file,'<table data-google-sheet-id="22" data-google-sheet-title="Resumo"><tr><td>Total</td></tr></table><table data-google-sheet-id="11" data-google-sheet-title="Dados"><tr><td>Nome</td></tr></table>');
    const writes=calls.filter(call=>call.init?.method==='PUT').map(call=>call.url);
    expect(writes.some(url=>url.includes(encodeURIComponent("'Resumo'!A1")))).toBe(true);
    expect(writes.some(url=>url.includes(encodeURIComponent("'Dados'!A1")))).toBe(true);
    expect(calls.filter(call=>call.url.includes('values:batchClear'))).toHaveLength(2);
  });
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
  it('allows an empty Google Doc to be cleared without inserting placeholder text',async()=>{
    const {calls}=setupFetch(url=>url.includes('/documents/doc-empty')&&!url.endsWith(':batchUpdate')?new Response(JSON.stringify({body:{content:[{endIndex:10}]}}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'doc-empty',name:'Empty',mimeType:'application/vnd.google-apps.document'};
    await saveCloudFile(file,'');
    const batch=calls.find(call=>call.url.endsWith(':batchUpdate'));
    const body=JSON.parse(String(batch?.init?.body));
    expect(body.requests).toEqual([{deleteContentRange:{range:{startIndex:1,endIndex:9}}}]);
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
  it('clears and updates a Google Sheets tab by stable ID',async()=>{
    const {calls}=setupFetch(url=>url.includes('/spreadsheets/sheet-1?fields=')?new Response(JSON.stringify({sheets:[{properties:{title:'Dados',index:0,sheetId:1}}]}),{status:200}):new Response('{}',{status:200}));
    const file:CloudFile={id:'sheet-1',name:'Dados',mimeType:'application/vnd.google-apps.spreadsheet'};
    await saveCloudFile(file,'<table data-google-sheet-id="1" data-google-sheet-title="Dados"><tr><td>nome</td><td>valor</td></tr><tr><td>Korczak</td><td>42</td></tr></table>');
    const clear=calls.find(call=>call.url.includes('values:batchClear'));
    const update=calls.find(call=>call.init?.method==='PUT');
    expect(update?.url).toContain('valueInputOption=USER_ENTERED');
    expect(JSON.parse(String(clear?.init?.body)).ranges).toEqual(["'Dados'!A:ZZ"]);
    expect(JSON.parse(String(update?.init?.body)).values).toEqual([['nome','valor'],['Korczak','42']]);
  });
});
