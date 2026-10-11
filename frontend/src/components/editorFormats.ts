function escapeRtfText(value:string):string{
  let result='';
  for(const ch of value){
    if(ch==='\\')result+='\\\\';
    else if(ch==='{')result+='\\{';
    else if(ch==='}')result+='\\}';
    else if(ch==='\n')result+='\\line ';
    else if(ch==='\r')continue;
    else if(ch==='\t')result+='\\tab ';
    else if(ch.codePointAt(0)!>0x7e){for(let i=0;i<ch.length;i++){const code=ch.charCodeAt(i);result+='\\u'+(code>32767?code-65536:code)+'?'}}
    else result+=ch;
  }
  return result;
}
export function htmlToRtf(html:string):string{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const render=(node:Node):string=>{
    if(node.nodeType===Node.TEXT_NODE)return escapeRtfText(node.textContent||'');
    if(node.nodeType!==1)return '';
    const element=node as Element;
    const tag=element.tagName.toLowerCase();
    const children=Array.from(node.childNodes).map(render).join('');
    switch(tag){
      case 'strong':case 'b':return '{\\b '+children+'}';
      case 'em':case 'i':return '{\\i '+children+'}';
      case 'u':return '{\\ul '+children+'}';
      case 's':case 'strike':case 'del':return '{\\strike '+children+'}';
      case 'sup':return '{\\super '+children+'}';
      case 'sub':return '{\\sub '+children+'}';
      case 'h1':return '{\\b\\fs36 '+children+'}\\par\n';
      case 'h2':return '{\\b\\fs30 '+children+'}\\par\n';
      case 'h3':return '{\\b\\fs26 '+children+'}\\par\n';
      case 'p':case 'div':case 'blockquote':case 'pre':return children+'\\par\n';
      case 'br':return '\\line ';
      case 'hr':return '\\par\\brdrb\\brdrs\\brdrw10\\brsp20\\par\n';
      case 'ul':case 'ol':return children+'\\par\n';
      case 'li':return (element.parentElement?.tagName.toLowerCase()==='ol'?'\\tab '+(Array.from(element.parentElement!.children).indexOf(element)+1)+'. ':'\\tab \\u8226? ')+children+'\\par\n';
      case 'table':return Array.from(element.querySelectorAll('tr')).map(tr=>Array.from(tr.children).map(cell=>(cell.textContent||'').trim()).join('\\tab ')+'\\par\n').join('');
      case 'a':return children+(element.getAttribute('href')?' ('+escapeRtfText(node.getAttribute('href')!)+')':'');
      case 'img':return escapeRtfText(node.getAttribute('alt')||'[Imagem]');
      default:return children;
    }
  };
  const body=Array.from(doc.body.childNodes).map(render).join('');
  return '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\viewkind4\\uc1\\f0\\fs22 '+body+'}';
}

export function normalizeHtmlForDocx(html:string):string{
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('em').forEach(element=>{
    const replacement=doc.createElement('i');
    Array.from(element.attributes).forEach(attribute=>replacement.setAttribute(attribute.name,attribute.value));
    while(element.firstChild)replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
  });
  doc.querySelectorAll('strong').forEach(element=>{
    const replacement=doc.createElement('b');
    Array.from(element.attributes).forEach(attribute=>replacement.setAttribute(attribute.name,attribute.value));
    while(element.firstChild)replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
  });
  return doc.body.innerHTML;
}
