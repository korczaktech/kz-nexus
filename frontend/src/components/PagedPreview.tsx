import {useEffect,useRef,useState} from 'react';
import {Previewer} from 'pagedjs';

export function PagedPreview({html,css,onClose}:{html:string;css:string;onClose:()=>void}){
  const target=useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(true);
  const [pageCount,setPageCount]=useState(0);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    const renderTarget=target.current;
    if(!renderTarget)return;
    renderTarget.replaceChildren();setBusy(true);setError('');setPageCount(0);
    const previewer=new Previewer();
    const previewCss='.pagedjs_pages{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px 16px 48px}.pagedjs_page{background:#fff;box-shadow:0 4px 22px #10182824;margin:0 auto}.pagedjs_pagebox{background:#fff}.pagedjs_area{overflow:hidden}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}th,td{border:1px solid #888;padding:6px;vertical-align:top}';
    const source='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+css+previewCss+'</style></head><body>'+html+'</body></html>';
    previewer.preview(source,[],renderTarget).then((flow:any)=>{
      if(cancelled)return;
      setPageCount(Number(flow?.total||renderTarget.querySelectorAll('.pagedjs_page').length||0));setBusy(false);
    }).catch((reason:unknown)=>{
      if(cancelled)return;
      setError(reason instanceof Error?reason.message:'Não foi possível paginar o documento.');setBusy(false);
    });
    return()=>{cancelled=true;renderTarget.replaceChildren()};
  },[html,css]);
  return <div role="dialog" aria-modal="true" aria-label="Pré-visualização paginada" className="paged-preview-overlay" style={{position:'fixed',inset:0,zIndex:10000,display:'flex',flexDirection:'column',background:'#eef1f5',color:'#172033'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'14px 20px',background:'#fff',borderBottom:'1px solid #d8dee8',boxShadow:'0 1px 4px #10182812'}}>
      <div><strong>Pré-visualização paginada</strong><div style={{fontSize:12,color:'#667085',marginTop:3}}>{busy?'Calculando quebras de página…':error?'Não foi possível gerar as páginas':pageCount+' página(s)'} · {html.length.toLocaleString('pt-BR')} caracteres</div></div>
      <button type="button" onClick={onClose} style={{border:'1px solid #d0d5dd',background:'#fff',borderRadius:8,padding:'8px 14px',cursor:'pointer'}}>Fechar</button>
    </div>
    {error&&<div role="alert" style={{padding:16,color:'#b42318'}}>{error}</div>}
    {busy&&<div role="status" style={{padding:24,textAlign:'center'}}>Preparando páginas para impressão…</div>}
    <div ref={target} className="paged-preview-pages" style={{overflow:'auto',flex:1}}/>
  </div>;
}
