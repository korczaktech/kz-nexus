import {useEffect,useMemo,useRef,useState} from 'react';
import type {DocumentItem,Version} from '../services/api';
import {clearDraft,preserveDraft,recoverDraft,saveWithDraftFallback} from './editorPersistence';

export type SaveState='saved'|'dirty'|'saving'|'conflict'|'error';
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function markdownToHtml(source:string){
  const safe=escapeHtml(source||'').replace(/\r\n/g,'\n'); const lines=safe.split('\n'); let html=''; let inUl=false; let inOl=false;
  const close=()=>{if(inUl){html+='</ul>';inUl=false}if(inOl){html+='</ol>';inOl=false}};
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/^\s*\|.+\|$/.test(line)&&/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i+1]||'')){
      close(); const header=parseTableRow(line); i++; const separator=lines[i]; void separator; const rows:string[][]=[];
      while(i+1<lines.length&&/^\s*\|.+\|$/.test(lines[i+1])&&!/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i+1])){i++;rows.push(parseTableRow(lines[i]))}
      html+='<table><thead><tr>'+header.map(cell=>'<th>'+inline(cell)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+inline(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';continue;
    }
    if(/^\s*[-*]\s+/.test(line)){if(!inUl){close();html+='<ul>';inUl=true}html+='<li>'+inline(line.replace(/^\s*[-*]\s+/,''))+'</li>';continue}
    if(/^\s*\d+[.)]\s+/.test(line)){if(!inOl){close();html+='<ol>';inOl=true}html+='<li>'+inline(line.replace(/^\s*\d+[.)]\s+/,''))+'</li>';continue}
    close(); if(!line.trim()){html+='<p><br></p>';continue}
    if(/^###\s+/.test(line)){html+='<h3>'+inline(line.replace(/^###\s+/,''))+'</h3>';continue}
    if(/^##\s+/.test(line)){html+='<h2>'+inline(line.replace(/^##\s+/,''))+'</h2>';continue}
    if(/^#\s+/.test(line)){html+='<h1>'+inline(line.replace(/^#\s+/,''))+'</h1>';continue}
    if(/^>\s+/.test(line)){html+='<blockquote>'+inline(line.replace(/^>\s+/,''))+'</blockquote>';continue}
    html+='<p>'+inline(line)+'</p>';
  } close(); return html||'<p><br></p>';
}
function parseTableRow(line:string){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim())}
function inline(value:string){
  const codes:string[]=[];
  let text=value.replace(/\`([^\`]+)\`/g,(_,code)=>{const key=String.fromCharCode(0)+codes.length+String.fromCharCode(0);codes.push('<code>'+code+'</code>');return key});
  text=text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/_([^_]+)_/g,'<em>$1</em>').replace(/~~([^~]+)~~/g,'<s>$1</s>');
  codes.forEach((code,index)=>{text=text.replace(String.fromCharCode(0)+index+String.fromCharCode(0),code)}); return text;
}
function toolbarInsert(value:string,start:number,end:number,text:string){const before=text.slice(0,start),selected=text.slice(start,end),after=text.slice(end);const marker=value.indexOf('$');const next=value.replace('$',selected);return{text:before+next+after,start:start+marker,end:start+marker+(selected||'').length};}
function applyWrap(text:string,start:number,end:number,left:string,right=left){const selected=text.slice(start,end)||'texto';const next=text.slice(0,start)+left+selected+right+text.slice(end);return{text:next,start:start+left.length,end:start+left.length+selected.length};}

export function Editor({document,versions,onSave,onClose,onConflict}:{document:DocumentItem;versions:Version[];onSave:(data:{name:string;document_type:string;content:string;base_version_id:string|null})=>Promise<'saved'|'conflict'>;onClose:()=>void;onConflict:()=>Promise<DocumentItem>}){
  const initial=document.content||'';const[name,setName]=useState(document.name);const[type,setType]=useState(document.document_type);const[content,setContent]=useState(initial);const[state,setState]=useState<SaveState>('saved');const[message,setMessage]=useState('Salvo');const[readOnly,setReadOnly]=useState(false);
  type LocalFile={file:File;path:string;editable:boolean};
  const[localFiles,setLocalFiles]=useState<LocalFile[]>([]);const[selectedLocalPath,setSelectedLocalPath]=useState('');const[folderName,setFolderName]=useState('');const[showFiles,setShowFiles]=useState(true);const[fileError,setFileError]=useState('');
  const fileInputRef=useRef<HTMLInputElement>(null);
  const history=useRef<string[]>([initial]),future=useRef<string[]>([]),timer=useRef<number|undefined>(undefined);const textarea=useRef<HTMLTextAreaElement>(null);
  const draft=useMemo(()=>{try{return recoverDraft(localStorage,document.id)}catch{return null}},[document.id]);
  useEffect(()=>{setName(document.name);setType(document.document_type);setContent(document.content||'');history.current=[document.content||''];future.current=[];setState('saved');setMessage('Salvo')},[document.id]);
  useEffect(()=>{if(draft!==null&&draft!==initial){setContent(draft);setState('dirty');setMessage('Rascunho local recuperado')}},[draft,initial]);
  useEffect(()=>{const saveDraft=()=>{if(state!=='saved'){try{preserveDraft(localStorage,document.id,content)}catch{}}};window.addEventListener('visibilitychange',saveDraft);return()=>window.removeEventListener('visibilitychange',saveDraft)},[content,state,document.id]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(state==='dirty'||state==='saving'||state==='conflict'){e.preventDefault();e.returnValue=true}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[state]);
  useEffect(()=>()=>{if(timer.current)window.clearTimeout(timer.current)},[]);
  function change(next:string){setContent(next);setState('dirty');setMessage('Alterações não salvas');future.current=[];const h=history.current;if(h[h.length-1]!==next){h.push(next);if(h.length>80)h.shift()}}
  function selection(){const el=textarea.current;return{start:el?.selectionStart||0,end:el?.selectionEnd||0}}
  function isEditableFile(file:File){return /^(text\/|application\/(json|javascript|xml|yaml|x-yaml|toml|sql)|image\/svg\+xml)/.test(file.type)||/\.(txt|md|markdown|mdx|json|js|jsx|ts|tsx|css|html|htm|xml|svg|yaml|yml|toml|sql|csv|log)$/i.test(file.name)}
  function chooseFolder(){setFileError('');fileInputRef.current?.click()}
  function handleFolderFiles(list:FileList|null){
    if(!list||!list.length)return;
    const files=Array.from(list).map(file=>({file,path:(file as File & {webkitRelativePath?:string}).webkitRelativePath||file.name,editable:isEditableFile(file)})).sort((a,b)=>a.path.localeCompare(b.path,'pt-BR'));
    setLocalFiles(files);setSelectedLocalPath('');setFolderName(files[0]?.path.split('/')[0]||'Pasta selecionada');setShowFiles(true);
  }
  async function openLocalFile(item:LocalFile){
    setFileError('');setSelectedLocalPath(item.path);
    if(!item.editable){setFileError('Este arquivo foi listado, mas o formato não é editável no navegador.');return}
    try{
      const text=await item.file.text();setContent(text);setName(item.file.name);setType(item.file.name.split('.').pop()?.toLowerCase()||'txt');history.current=[text];future.current=[];setState('dirty');setMessage('Arquivo local aberto — salve para aplicar ao documento');textarea.current?.focus();
    }catch{setFileError('Não foi possível ler este arquivo.')}
  }
  function downloadCurrent(){const ext=(type||'txt').replace(/[^a-z0-9]/gi,'')||'txt';const blob=new Blob([content],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=window.document.createElement('a');a.href=url;a.download=(name.replace(/\.[^.]+$/,'')||'documento')+'.'+ext;a.click();URL.revokeObjectURL(url)}
  function clearLocalFolder(){setLocalFiles([]);setFolderName('');setSelectedLocalPath('');setFileError('')}
  function insert(value:string){const{start,end}=selection();const r=toolbarInsert(value,start,end,content);change(r.text);requestAnimationFrame(()=>{textarea.current?.focus();textarea.current?.setSelectionRange(r.start,r.end)})}
  function wrap(left:string,right=left){const{start,end}=selection();const r=applyWrap(content,start,end,left,right);change(r.text);requestAnimationFrame(()=>{textarea.current?.focus();textarea.current?.setSelectionRange(r.start,r.end)})}
  function command(cmd:string){if(cmd==='bold')wrap('**');else if(cmd==='italic')wrap('*');else if(cmd==='strike')wrap('~~');else if(cmd==='h1')insert('# $\n');else if(cmd==='h2')insert('## $\n');else if(cmd==='h3')insert('### $\n');else if(cmd==='ul')insert('- $\n');else if(cmd==='ol')insert('1. $\n');else if(cmd==='quote')insert('> $\n');else if(cmd==='code')wrap(String.fromCharCode(96));else if(cmd==='link'){const url=window.prompt('URL do link:','https://');if(url)insert('[$]('+url+')')}else if(cmd==='table')insert('| Coluna 1 | Coluna 2 |\n| --- | --- |\n| $ | Valor |\n');}
  function undo(){if(history.current.length<2)return;const current=history.current.pop()!;future.current.push(current);setContent(history.current[history.current.length-1]);setState('dirty');setMessage('Alterações não salvas')}
  function redo(){const next=future.current.pop();if(!next)return;history.current.push(next);setContent(next);setState('dirty');setMessage('Alterações não salvas')}
  async function save(){if(readOnly||state==='saving')return;setState('saving');setMessage('Salvando…');try{const result=await saveWithDraftFallback(localStorage,document.id,content,()=>onSave({name,document_type:type,content,base_version_id:document.current_version_id}),result=>result==='saved');if(result==='conflict'){setState('conflict');setMessage('Conflito: o documento foi alterado em outra sessão');return}history.current=[content];future.current=[];setState('saved');setMessage('Salvo agora')}catch{setState('error');setMessage('Falha ao salvar. O rascunho local foi preservado.')}}
  useEffect(()=>{if(state!=='dirty')return;if(timer.current)window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>{void save()},1400)},[content,name,type]);
  function requestClose(){if(state==='dirty'||state==='saving'||state==='conflict'||state==='error'){if(!window.confirm('Existem alterações não salvas. Deseja realmente sair?'))return}onClose()}
  const toolbar=[['bold','B','Negrito'],['italic','I','Itálico'],['strike','S','Riscado'],['h1','H1','Título 1'],['h2','H2','Título 2'],['h3','H3','Título 3'],['ul','•','Lista'],['ol','1.','Lista numerada'],['quote','❯','Citação'],['code','<>','Código'],['link','↗','Link'],['table','▦','Tabela']];
  return <section className="editor-workspace">
    <header className="editor-head"><div><div className="editor-breadcrumb">DOCUMENTO / EDIÇÃO</div><input className="editor-title" value={name} onChange={e=>{setName(e.target.value);setState('dirty');setMessage('Alterações não salvas')}}/><div className={'save-state '+state}><span className="save-dot"/>{message}{versions.length?' · v'+versions[0].version_number:''}</div></div><div className="editor-actions"><button className="editor-secondary" onClick={()=>setReadOnly(!readOnly)}>{readOnly?'Editar':'Somente leitura'}</button>{state==='conflict'&&<button className="editor-secondary" onClick={async()=>{const fresh=await onConflict();try{clearDraft(localStorage,document.id)}catch{}setContent(fresh.content||'');setName(fresh.name);setType(fresh.document_type);history.current=[fresh.content||''];future.current=[];setState('saved');setMessage('Versão atual recarregada')}}>Recarregar versão atual</button>}<button className="editor-secondary" onClick={requestClose}>Sair</button><button className="editor-save" disabled={state==='saving'||readOnly} onClick={()=>void save()}>Salvar</button></div></header>
    {!readOnly&&<div className="editor-toolbar">{toolbar.map(([cmd,label,title])=><button type="button" key={cmd} title={title} onMouseDown={e=>e.preventDefault()} onClick={()=>command(cmd)}>{label}</button>)}<span className="toolbar-separator"/><button type="button" onClick={undo} disabled={history.current.length<2} title="Desfazer">↶</button><button type="button" onClick={redo} disabled={!future.current.length} title="Refazer">↷</button></div>}
    <div className="editor-info"><span>{type.toUpperCase()}</span><span>{content.length.toLocaleString('pt-BR')} caracteres</span><span>{state==='saved'?'Sincronizado':state==='saving'?'Sincronizando':state==='conflict'?'Conflito detectado':'Alterações locais'}</span></div>
    <div className={'editor-body '+(readOnly?'readonly':'')}>
      <input ref={fileInputRef} type="file" multiple style={{display:'none'}} onChange={e=>handleFolderFiles(e.target.files)} {...({webkitdirectory:'',directory:''} as React.InputHTMLAttributes<HTMLInputElement>)}/>
      <textarea ref={textarea} value={content} readOnly={readOnly} onChange={e=>change(e.target.value)} spellCheck aria-label="Conteúdo do documento"/>
      <aside className="editor-side">
        <div className="editor-files-head"><strong>Arquivos</strong><button type="button" className="editor-file-action" onClick={chooseFolder}>Selecionar pasta</button></div>
        {folderName&&<div className="editor-folder-name" title={folderName}>📁 {folderName}<button type="button" onClick={clearLocalFolder} aria-label="Limpar pasta">×</button></div>}
        {fileError&&<div className="editor-file-error">{fileError}</div>}
        {showFiles&&localFiles.length>0&&<div className="editor-file-list" aria-label="Arquivos da pasta">
          {localFiles.map(item=><button type="button" key={item.path} className={'editor-file-item '+(selectedLocalPath===item.path?'active':'')} onClick={()=>void openLocalFile(item)} title={item.path}>
            <span>{item.editable?'▤':'◉'}</span><span>{item.path}</span>
          </button>)}
        </div>}
        {!localFiles.length&&<div className="editor-files-empty">Nenhuma pasta selecionada. Selecione uma pasta para carregar seus arquivos aqui.</div>}
        <div className="editor-side-divider"/>
        <strong>Documento</strong><label>Tipo<select value={type} onChange={e=>{setType(e.target.value);setState('dirty')}} disabled={readOnly}><option value="txt">Texto</option><option value="md">Markdown</option><option value="doc">Documento</option></select></label><div><span>Versão atual</span><strong>{versions[0]?.version_number||'1'}</strong></div><div><span>Última alteração</span><strong>{new Date(document.updated_at).toLocaleString('pt-BR')}</strong></div><div><span>Proteção</span><strong>Rascunho local ativo</strong></div></aside></div>
    <footer className="editor-foot"><span>Desfazer/refazer pelo editor · alterações locais preservadas em caso de interrupção.</span><div className="editor-foot-actions"><button type="button" className="editor-secondary" onClick={downloadCurrent}>Exportar arquivo</button><span>{readOnly?'MODO SOMENTE LEITURA':'MODO EDIÇÃO'}</span></div></footer>
  </section>
}
