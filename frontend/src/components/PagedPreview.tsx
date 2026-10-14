import {useEffect,useRef,useState} from 'react';
import type {CSSProperties,ReactNode} from 'react';
import {Previewer} from 'pagedjs';
import {layoutDocument, type LayoutBlock, type LayoutLine, type LayoutResult, type Mark, type NexusDocument, type TextMetrics} from '../../../packages/engine/src/index';

type NativeLayoutState={result:LayoutResult;diagnostics:string[]};
type PreviewProps={
  html:string;css:string;onClose:()=>void;document?:NexusDocument;useNativeLayout?:boolean;
  headerText?:string;footerText?:string;showPageNumbers?:boolean;
};
const PT_TO_PX=96/72;
const px=(points:number)=>points*PT_TO_PX;

function runStyle(marks:Mark[],fontSize:number,fontFamily:string):CSSProperties{
  const style:React.CSSProperties={fontSize:px(fontSize),fontFamily};
  for(const mark of marks){
    if(mark.type==='bold')style.fontWeight=700;
    else if(mark.type==='italic')style.fontStyle='italic';
    else if(mark.type==='underline')style.textDecoration=[style.textDecoration,'underline'].filter(Boolean).join(' ');
    else if(mark.type==='strike')style.textDecoration=[style.textDecoration,'line-through'].filter(Boolean).join(' ');
    else if(mark.type==='superscript'){style.verticalAlign='super';style.fontSize=px(fontSize*.75)}
    else if(mark.type==='subscript'){style.verticalAlign='sub';style.fontSize=px(fontSize*.75)}
    else if(mark.type==='color')style.color=mark.value;
    else if(mark.type==='highlight')style.backgroundColor=mark.value;
    else if(mark.type==='fontSize')style.fontSize=px(mark.value*.75);
    else if(mark.type==='fontFamily')style.fontFamily=mark.value;
    else if(mark.type==='link'){style.color='#0563c1';style.textDecoration=[style.textDecoration,'underline'].filter(Boolean).join(' ')}
    else if(mark.type==='comment'){style.backgroundColor='#fef3c7';style.borderBottom='2px dotted #d97706'}
  }
  return style;
}

function LineVisual({line}: {line:LayoutLine}){
  const align=line.align==='center'?'center':line.align==='end'?'right':line.align==='justify'?'justify':'left';
  return <div style={{position:'absolute',left:px(line.x),top:px(line.y),width:Math.max(0,px(line.width)),height:px(line.height),boxSizing:'border-box',whiteSpace:'pre',overflow:'visible',lineHeight:px(line.height),textAlign:align,textAlignLast:line.align==='justify'?'justify':undefined,fontSize:px(11),fontFamily:'Arial,sans-serif',color:'#111'}}>
    {line.runs?.length?line.runs.map((run,index)=><span key={index} style={runStyle(run.marks,run.fontSize,run.fontFamily)}>{run.text}</span>):line.text}
  </div>;
}

function BlockVisual({block,document}: {block:LayoutBlock;document:NexusDocument}){
  const scale=PT_TO_PX;
  if(block.type==='image'){
    const model=document.content.find(item=>item.id===block.blockId);
    if(!model||model.type!=='image')return null;
    const resource=document.resources.find(item=>item.id===model.resourceId);
    if(!resource)return <div style={{position:'absolute',left:px(block.rect.x),top:px(block.rect.y),width:px(block.rect.width),height:px(block.rect.height),color:'#667085',fontSize:12}}>{model.alt||'Imagem indisponível'}</div>;
    return <img alt={model.alt} src={'data:'+resource.mimeType+';base64,'+resource.data} style={{position:'absolute',left:px(block.rect.x),top:px(block.rect.y),width:px(block.rect.width),height:px(block.rect.height),objectFit:'contain'}}/>;
  }
  if(block.type==='thematicBreak')return <div style={{position:'absolute',left:px(block.rect.x),top:px(block.rect.y),width:px(block.rect.width),borderTop:'1px solid #98a2b3'}}/>;
  const children:ReactNode[]=[];
  if(block.table){
    for(const row of block.table.rows){
      for(const cell of row.cells){
        children.push(<div key={'cell-'+cell.cellId} style={{position:'absolute',left:px(cell.rect.x),top:px(cell.rect.y),width:px(cell.rect.width),height:px(cell.rect.height),border:'1px solid #98a2b3',boxSizing:'border-box',background:'#fff'}}/>);
        cell.lines.forEach((line,index)=>children.push(<LineVisual key={'cell-line-'+cell.cellId+'-'+index} line={line}/>));
      }
    }
  }
  if(block.lines.length)block.lines.forEach((line,index)=>children.push(<LineVisual key={'line-'+block.blockId+'-'+index+'-'+line.startOffset} line={line}/>));
  const model=document.content.find(item=>item.id===block.blockId);
  if(model&&(model.type==='paragraph'||model.type==='heading')&&(model.backgroundColor||model.borderColor)){
    children.unshift(<div key="block-decoration" style={{position:'absolute',left:px(block.rect.x),top:px(block.rect.y),width:px(block.rect.width),height:px(block.rect.height),background:model.backgroundColor||'transparent',border:model.borderColor&&model.borderWidth?px(model.borderWidth)+'px solid '+model.borderColor:undefined,boxSizing:'border-box',pointerEvents:'none'}}/>);
  }
  return <>{children}</>;
}

function NativePages({layout,document,headerText,footerText,showPageNumbers}:{layout:LayoutResult;document:NexusDocument;headerText:string;footerText:string;showPageNumbers:boolean}){
  return <div className="kortex-native-pages" style={{display:'flex',flexDirection:'column',alignItems:'center',gap:24,padding:'24px 16px 48px'}}>
    {layout.pages.map(page=><div key={page.index} className="kortex-native-page" style={{position:'relative',flex:'0 0 auto',width:px(page.width),height:px(page.height),background:'#fff',boxShadow:'0 4px 22px #10182824',overflow:'hidden'}}>
      {headerText&&<div style={{position:'absolute',left:px(page.content.x),top:px(12),width:px(page.content.width),font:'9pt Arial,sans-serif',color:'#667085'}}>{headerText}</div>}
      {page.blocks.map((block,index)=><BlockVisual key={block.blockId+'-'+page.index+'-'+index} block={block} document={document}/>)}
      {footerText&&<div style={{position:'absolute',left:px(page.content.x),bottom:px(12),width:px(page.content.width),font:'9pt Arial,sans-serif',color:'#667085'}}>{footerText}</div>}
      {showPageNumbers&&<div style={{position:'absolute',right:px(page.content.x),bottom:px(12),font:'9pt Arial,sans-serif',color:'#667085'}}>Página {page.index+1} de {layout.pageCount}</div>}
    </div>)}
  </div>;
}

export function PagedPreview({html,css,onClose,document,useNativeLayout=true,headerText='',footerText='',showPageNumbers=false}:PreviewProps){
  const target=useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(true);
  const [pageCount,setPageCount]=useState(0);
  const [error,setError]=useState('');
  const [nativeLayout,setNativeLayout]=useState<NativeLayoutState|null>(null);
  useEffect(()=>{
    if(!document){setNativeLayout(null);return}
    setNativeLayout(null);
    try{
      const canvas=window.document.createElement('canvas');
      let context:CanvasRenderingContext2D|null=null;
      try{context=canvas.getContext('2d')}catch{context=null}
      const metrics:TextMetrics|undefined=context?{
        measureText:(text,size,family,marks=[])=>{const style=(marks.some(mark=>mark.type==='italic')?'italic ':'')+(marks.some(mark=>mark.type==='bold')?'bold ':'');context!.font=style+(size*96/72)+'px '+family;return context!.measureText(text).width*72/96},
        lineHeight:(size)=>size*1.2
      }:undefined;
      const result=layoutDocument(document,{fontFamily:'Arial',metrics,keepHeadingsWithNext:true,keepParagraphsTogether:true});
      setNativeLayout({result,diagnostics:result.diagnostics.map(item=>item.message)});
    }catch(reason){
      setNativeLayout({result:{pages:[],pageCount:0,diagnostics:[]},diagnostics:[reason instanceof Error?reason.message:'Falha na análise geométrica nativa.']});
    }
  },[document,html,css]);
  useEffect(()=>{
    let cancelled=false;
    const renderTarget=target.current;
    if(!renderTarget)return;
    renderTarget.replaceChildren();setError('');setPageCount(0);
    if(document&&useNativeLayout&&!nativeLayout){setBusy(true);return()=>{cancelled=true}}
    if(document&&useNativeLayout&&nativeLayout?.result.pageCount){
      setPageCount(nativeLayout.result.pageCount);setBusy(false);
      return()=>{cancelled=true};
    }
    setBusy(true);
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
  },[html,css,document,nativeLayout,useNativeLayout]);
  return <div role="dialog" aria-modal="true" aria-label="Pré-visualização paginada" className="paged-preview-overlay" style={{position:'fixed',inset:0,zIndex:10000,display:'flex',flexDirection:'column',background:'#eef1f5',color:'#172033'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,padding:'14px 20px',background:'#fff',borderBottom:'1px solid #d8dee8',boxShadow:'0 1px 4px #10182812'}}>
      <div><strong>Pré-visualização paginada</strong><div style={{fontSize:12,color:'#667085',marginTop:3}}>{busy?'Calculando quebras de página…':error?'Não foi possível gerar as páginas':pageCount+' página(s)'} · {html.length.toLocaleString('pt-BR')} caracteres{nativeLayout?.result.pageCount&&document&&useNativeLayout?' · Kortex nativo':''}</div></div>
      <button type="button" onClick={onClose} style={{border:'1px solid #d0d5dd',background:'#fff',borderRadius:8,padding:'8px 14px',cursor:'pointer'}}>Fechar</button>
    </div>
    {error&&<div role="alert" style={{padding:16,color:'#b42318'}}>{error}</div>}
    {nativeLayout?.diagnostics.length&&document&&useNativeLayout?<div role="status" style={{padding:'10px 16px',background:'#fff4e5',color:'#7a2e0e',borderBottom:'1px solid #f2c078'}}><strong>Análise do Kortex:</strong> {nativeLayout.diagnostics.join(' ')}</div>:null}
    {busy&&<div role="status" style={{padding:24,textAlign:'center'}}>Preparando páginas para impressão…</div>}
    <div ref={target} className="paged-preview-pages" style={{overflow:'auto',flex:1,display:document&&useNativeLayout?'none':undefined}}/>
    {!busy&&document&&useNativeLayout&&Boolean(nativeLayout?.result.pageCount)&&<div style={{overflow:'auto',flex:1}}><NativePages layout={nativeLayout.result} document={document} headerText={headerText} footerText={footerText} showPageNumbers={showPageNumbers}/></div>}
  </div>;
}
