const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
type State={bold:boolean;italic:boolean;underline:boolean;strike:boolean;fontSize:number|null;color:string|null;backgroundColor:string|null;alignment:'left'|'center'|'right'|'justify'};
function readRtfColors(source:string):(string|null)[]{
  const match=source.match(/\\colortbl([\s\S]*?)\}/i);
  if(!match)return[null];
  const entries=match[1].split(';');if(entries[entries.length-1]==='')entries.pop();
  return entries.map(entry=>{const red=entry.match(/\\red(\d+)/i),green=entry.match(/\\green(\d+)/i),blue=entry.match(/\\blue(\d+)/i);if(!red&&!green&&!blue)return null;const hex=(value:string)=>Math.max(0,Math.min(255,Number(value)||0)).toString(16).padStart(2,'0');return '#'+hex(red?.[1]||'0')+hex(green?.[1]||'0')+hex(blue?.[1]||'0')});
}
export function parseRtfToHtml(source:string):string{
  const state:State={bold:false,italic:false,underline:false,strike:false,fontSize:null,color:null,backgroundColor:null,alignment:'left'};const stack:State[]=[];let current={...state};const openParagraph=()=>'<p'+(current.alignment==='left'?'':' style="text-align:'+current.alignment+'"')+'>';let html=openParagraph();let skipFallback=false;const colors=readRtfColors(source);
  const emit=(value:string)=>{if(!value)return;let chunk=escapeHtml(value);if(current.bold)chunk='<strong>'+chunk+'</strong>';if(current.italic)chunk='<em>'+chunk+'</em>';if(current.underline)chunk='<u>'+chunk+'</u>';if(current.strike)chunk='<s>'+chunk+'</s>';const styles:string[]=[];if(current.fontSize)styles.push('font-size:'+(current.fontSize/2)+'pt');if(current.color)styles.push('color:'+current.color);if(current.backgroundColor)styles.push('background-color:'+current.backgroundColor);if(styles.length)chunk='<span style="'+styles.join(';')+'">'+chunk+'</span>';html+=chunk};
  const tokens=source.match(/\\'[0-9a-f]{2}|\\[a-zA-Z]+-?\d* ?|\\.|[{}]|[^\\{}]+/gi)||[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(token==='{'){
      let look=i+1;if(tokens[look]==='\\*')look++;
      const destination=(tokens[look]||'').match(/^\\([a-zA-Z]+)/)?.[1]?.toLowerCase();
      if(destination==='pict'){
        let depth=1,j=i+1;for(;j<tokens.length&&depth>0;j++){if(tokens[j]==='{')depth++;else if(tokens[j]==='}')depth--}
        const group=tokens.slice(i,j).join('');const mime=group.includes('\\jpegblip')?'jpeg':group.includes('\\pngblip')?'png':'';
        const hex=group.replace(/\\[a-zA-Z]+-?\d* ?/g,'').replace(/[{}\\\s]/g,'');
        if(mime&&hex.length>=2&&hex.length%2===0){let binary='';for(let p=0;p<hex.length;p+=2)binary+=String.fromCharCode(parseInt(hex.slice(p,p+2),16));html+='<img src="data:image/'+mime+';base64,'+btoa(binary)+'" alt="Imagem importada">'}
        i=j-1;continue;
      }
      if(destination&&['fonttbl','colortbl','stylesheet','info','object','header','footer','filetbl','listtable','listoverridetable','generator','xmlopen','xmlclose','datastore','themedata','colorschememapping'].includes(destination)){
        let depth=1,j=i+1;for(;j<tokens.length&&depth>0;j++){if(tokens[j]==='{')depth++;else if(tokens[j]==='}')depth--}i=j-1;continue;
      }
      stack.push({...current});continue;
    }
    if(token==='}'){
      current=stack.pop()||{bold:false,italic:false,underline:false,strike:false,fontSize:null,color:null,backgroundColor:null,alignment:'left'};continue;
    }
    if(token.startsWith("\\'")){
      if(skipFallback){skipFallback=false;continue}emit(String.fromCharCode(parseInt(token.slice(2),16)));continue;
    }
    if(token.startsWith('\\')){
      const match=token.match(/^\\([a-zA-Z]+)(-?\d+)? ?$/);
      if(!match){
        const symbol=token.slice(1);
        if(symbol==='{'||symbol==='}'||symbol==='\\')emit(symbol);
        else if(symbol==='~')emit('\u00a0');
        else if(symbol==='_')emit('\u2011');
        else if(symbol==='-')emit('\u00ad');
        continue;
      }
      const word=match[1].toLowerCase(),number=match[2]===undefined?undefined:Number(match[2]);
      if(word==='b')current.bold=number!==0;
      else if(word==='i')current.italic=number!==0;
      else if(word==='ul'||word==='ulw'||word==='uldb')current.underline=true;
      else if(word==='ulnone')current.underline=false;
      else if(word==='strike'||word==='striked')current.strike=number!==0;
      else if(word==='plain')current={...current,bold:false,italic:false,underline:false,strike:false,fontSize:null,color:null,backgroundColor:null};
      else if(word==='fs'&&number!==undefined)current.fontSize=Math.max(2,Math.min(327,number));
      else if(word==='cf'&&number!==undefined)current.color=colors[number]||null;
      else if(word==='highlight'&&number!==undefined)current.backgroundColor=colors[number]||null;
      else if(['ql','qc','qr','qj'].includes(word)){const alignment=word==='qc'?'center':word==='qr'?'right':word==='qj'?'justify':'left';if(current.alignment!==alignment){current.alignment=alignment;if(html.endsWith('<p>'))html=html.slice(0,-3)+openParagraph();else html+='</p>'+openParagraph()}}
      else if(word==='par'||word==='row'){html+='</p>'+openParagraph();skipFallback=false}
      else if(word==='line')html+='<br>';
      else if(word==='tab')html+='&#9;';
      else if(word==='bullet')emit('•');
      else if(word==='emdash')emit('—');
      else if(word==='endash')emit('–');
      else if(word==='lquote')emit('‘');
      else if(word==='rquote')emit('’');
      else if(word==='ldblquote')emit('“');
      else if(word==='rdblquote')emit('”');
      else if(word==='u'&&number!==undefined){const code=number<0?number+65536:number;emit(String.fromCharCode(code));skipFallback=true}
      else if(word==='bin'&&number!==undefined){i+=number}
      continue;
    }
    let text=token;
    if(skipFallback&&text.length){text=text.slice(1);skipFallback=false}
    text=text.replace(/\r\n?|\n/g,' ');
    emit(text);
  }
  html+='</p>';
  return html.replace(/<p>\s*<\/p>/g,'<p><br></p>').replace(/(?:<\/p>){2,}/g,'</p>').replace(/<p><\/p>/g,'');
}
