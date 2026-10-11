const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
type State={bold:boolean;italic:boolean;underline:boolean;strike:boolean};
export function parseRtfToHtml(source:string):string{
  const state:State={bold:false,italic:false,underline:false,strike:false};const stack:State[]=[];let current={...state};let html='<p>';let skipFallback=false;
  const emit=(value:string)=>{if(!value)return;let chunk=escapeHtml(value);if(current.bold)chunk='<strong>'+chunk+'</strong>';if(current.italic)chunk='<em>'+chunk+'</em>';if(current.underline)chunk='<u>'+chunk+'</u>';if(current.strike)chunk='<s>'+chunk+'</s>';html+=chunk};
  const tokens=source.match(/\\'[0-9a-f]{2}|\\[a-zA-Z]+-?\d* ?|\\.|[{}]|[^\\{}]+/gi)||[];
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(token==='{'){
      let look=i+1;if(tokens[look]==='\\\\*')look++;
      const destination=(tokens[look]||'').match(/^\\\\([a-zA-Z]+)/)?.[1]?.toLowerCase();
      if(destination&&['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','filetbl','listtable','listoverridetable','generator','xmlopen','xmlclose','datastore','themedata','colorschememapping'].includes(destination)){
        let depth=1,j=i+1;for(;j<tokens.length&&depth>0;j++){if(tokens[j]==='{')depth++;else if(tokens[j]==='}')depth--}i=j-1;continue;
      }
      stack.push({...current});continue;
    }
    if(token==='}'){
      current=stack.pop()||{bold:false,italic:false,underline:false,strike:false};continue;
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
      else if(word==='plain')current={bold:false,italic:false,underline:false,strike:false};
      else if(word==='par'||word==='row'){html+='</p><p>';skipFallback=false}
      else if(word==='line')html+='<br>';
      else if(word==='tab')html+='&#9;';
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
