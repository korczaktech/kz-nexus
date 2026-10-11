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
    const element=node as Element;const tag=element.tagName?.toLowerCase();
    return (node.textContent||'')+(['p','div','li','br','h1','h2','h3','tr'].includes(tag||'')?'\n':'');
  }).join('');
  return parseCsv(lines);
}
