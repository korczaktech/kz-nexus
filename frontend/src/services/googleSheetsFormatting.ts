function parseCsv(source:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(ch==='"'&&quoted&&source[i+1]==='"'){cell+='"';i++;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(ch===','&&!quoted){row.push(cell);cell='';continue}
    if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(cell);if(row.some(value=>value.length>0))rows.push(row);row=[];cell='';continue}
    cell+=ch;
  }
  row.push(cell);if(row.some(value=>value.length>0))rows.push(row);
  return rows;
}
export function htmlToSpreadsheetValues(html:string):string[][]{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const table=doc.body.querySelector('table');
  if(table)return Array.from(table.querySelectorAll('tr')).map(tr=>Array.from(tr.children).map(cell=>(cell.textContent||'').trim())).filter(row=>row.length>0);
  const lines=Array.from(doc.body.childNodes).map(node=>{
    if(node.nodeType===3)return node.textContent||'';
    if(node.nodeType!==1)return '';
    const element=node as Element;const tag=element.tagName?.toLowerCase();
    return (node.textContent||'')+(['p','div','li','br','h1','h2','h3','tr'].includes(tag||'')?'\n':'');
  }).join('');
  return parseCsv(lines);
}

export function htmlToPlainText(html:string):string{
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style').forEach(node=>node.remove());
  const render=(node:Node):string=>{
    if(node.nodeType===3)return node.textContent||'';
    if(node.nodeType!==1)return '';
    const element=node as Element,tag=element.tagName.toLowerCase();
    if(tag==='br')return '\n';
    if(tag==='td'||tag==='th')return Array.from(element.childNodes).map(render).join('')+'\t';
    const children=Array.from(element.childNodes).map(render).join('');
    if(['p','div','li','h1','h2','h3','h4','h5','h6','tr','section','blockquote','pre'].includes(tag))return children.replace(/\t$/,'')+'\n';
    return children;
  };
  return render(doc.body).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}

export type SpreadsheetTable={sheetId:string;title:string;values:string[][]};
export function htmlToSpreadsheetTables(html:string):SpreadsheetTable[]{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const tables=Array.from(doc.body.querySelectorAll('table'));
  if(!tables.length)throw new Error('O documento não contém abas de planilha identificadas. Reimporte a planilha antes de sincronizar.');
  const result:SpreadsheetTable[]=[];
  for(const table of tables){
    const sheetId=table.getAttribute('data-google-sheet-id')||'';
    const title=table.getAttribute('data-google-sheet-title')||'';
    if(!sheetId||!title)throw new Error('Uma tabela perdeu o identificador ou o nome da aba original. Reimporte a planilha antes de sincronizar.');
    if(result.some(item=>item.sheetId===sheetId))throw new Error('Há identificadores de abas duplicados no documento. Reimporte a planilha antes de sincronizar.');
    const values=Array.from(table.querySelectorAll('tr')).map(row=>Array.from(row.children).map(cell=>(cell.textContent||'').trim()));
    result.push({sheetId,title,values});
  }
  return result;
}
