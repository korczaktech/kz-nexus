export type PdfTextItem={str?:string;transform?:number[];width?:number;height?:number;hasEOL?:boolean};
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function pdfTextItemsToHtml(items:PdfTextItem[]):string{
  const positioned=items.filter(item=>typeof item.str==='string'&&item.str.length>0&&Array.isArray(item.transform)&&item.transform.length>=6)
    .map(item=>({text:item.str!,x:Number(item.transform![4]),y:Number(item.transform![5]),width:Math.max(0,Number(item.width)||0),height:Math.max(1,Number(item.height)||Math.abs(Number(item.transform![3])||10)),hasEOL:Boolean(item.hasEOL)}))
    .sort((a,b)=>Math.abs(b.y-a.y)>2?b.y-a.y:a.x-b.x);
  const lines:{y:number;height:number;items:typeof positioned}[]=[];
  for(const item of positioned){
    let line=lines.find(candidate=>Math.abs(candidate.y-item.y)<=Math.max(2,item.height*0.25));
    if(!line){line={y:item.y,height:item.height,items:[]};lines.push(line)}
    line.items.push(item);line.height=Math.max(line.height,item.height);
  }
  lines.sort((a,b)=>b.y-a.y);
  return lines.map(line=>{
    line.items.sort((a,b)=>a.x-b.x);
    let text='',right=-Infinity;
    for(const item of line.items){
      const gap=item.x-right;
      if(text&&gap>Math.max(2,line.height*0.12)&&!/\s$/.test(text)&&!/^\s/.test(item.text))text+=' ';
      text+=item.text;right=Math.max(right,item.x+item.width);
    }
    return '<p>'+escapeHtml(text.trim())+'</p>';
  }).join('');
}

export function shouldRunPdfOcr(extractedText:string,hasImages=false):boolean{
  const text=extractedText.replace(/\s+/g,' ').trim();
  if(!text)return true;
  return text.length<80||(hasImages&&text.length<600);
}
export function mergePdfOcrParagraphs(nativeHtml:string,ocrText:string):string{
  const paragraphs=ocrText.split(/\n{2,}/).map(value=>value.trim()).filter(Boolean);
  const nativeText=nativeHtml.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^a-z0-9À-ÿ]+/gi,' ').trim();
  const nativeNormalized=normalize(nativeText);
  const additions=paragraphs.filter(paragraph=>{
    const candidate=normalize(paragraph);
    return candidate&&(!nativeNormalized||(!nativeNormalized.includes(candidate)&&!candidate.includes(nativeNormalized)));
  });
  return [nativeHtml,...additions.map(paragraph=>'<p>'+escapeHtml(paragraph).replace(/\n/g,'<br>')+'</p>')].filter(Boolean).join('');
}
