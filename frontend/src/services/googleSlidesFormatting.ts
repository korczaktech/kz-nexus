function renderNode(node:Node):string{
  if(node.nodeType===3)return node.textContent||'';
  if(node.nodeType!==1)return '';
  const element=node as Element,tag=element.tagName.toLowerCase();
  if(tag==='br')return '\n';
  return Array.from(element.childNodes).map(renderNode).join('');
}
export function htmlToSlideParagraphs(html:string):string[]{
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(doc.body.querySelector('table'))throw new Error('A sincronização com Google Slides não recria tabelas adicionadas no Nexus. Exporte o documento como DOCX para preservar a estrutura.');
  if(doc.body.querySelector('img'))throw new Error('A sincronização com Google Slides não insere imagens novas. Remova as imagens adicionadas no Nexus para sincronizar o texto.');
  if(doc.body.querySelector('strong,em,b,i,u,s,del,a,span[style]'))throw new Error('A sincronização com Google Slides preserva texto simples, mas não aplica nova formatação inline. Remova a formatação adicional para sincronizar.');
  const result:string[]=[];
  const process=(node:Node)=>{
    if(node.nodeType===3){const text=(node.textContent||'').trim();if(text)result.push(text);return}
    if(node.nodeType!==1)return;
    const element=node as Element,tag=element.tagName.toLowerCase();
    if(tag==='img')throw new Error('A sincronização com Google Slides ainda não insere imagens novas; remova as imagens adicionadas no Nexus para sincronizar o texto sem perdas.');
    if(tag==='table'){Array.from(element.querySelectorAll('tr')).forEach(row=>result.push(Array.from(row.children).map(cell=>(cell.textContent||'').trim()).join('\t')));return}
    if(['p','div','li','h1','h2','h3','h4','h5','h6','blockquote','pre'].includes(tag)){result.push(renderNode(node));return}
    Array.from(node.childNodes).forEach(process);
  };
  Array.from(doc.body.childNodes).forEach(process);
  return result;
}
export function slideShapeText(shape:any):string{
  const elements=shape?.text?.textElements||[];
  return elements.map((element:any)=>element.textRun?.content||'').join('').replace(/\n+$/,'');
}
export function escapeSlideHtml(value:string):string{
  return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export type SlideTextBox={objectId:string;text:string};
export function htmlToSlideTextBoxes(html:string):SlideTextBox[]{
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(doc.body.querySelector('table'))throw new Error('A sincronização com Google Slides não recria tabelas. Exporte como DOCX para preservar a estrutura.');
  if(doc.body.querySelector('img'))throw new Error('A sincronização com Google Slides não insere imagens novas. Remova as imagens adicionadas no Nexus para sincronizar o texto.');
  if(doc.body.querySelector('strong,em,b,i,u,s,del,a,span[style]'))throw new Error('A sincronização com Google Slides preserva texto simples, mas não aplica nova formatação inline. Remova a formatação adicional para sincronizar.');
  const boxes:SlideTextBox[]=[];
  for(const node of Array.from(doc.body.children)){
    const id=node.getAttribute('data-slide-object-id');
    if(!id)throw new Error('A sincronização segura com Google Slides exige que cada caixa de texto original mantenha seu identificador. Não adicione novos parágrafos; reimporte a apresentação para restaurar o mapeamento.');
    if(boxes.some(box=>box.objectId===id))throw new Error('Identificador de caixa de texto duplicado no documento. Reimporte a apresentação antes de sincronizar.');
    boxes.push({objectId:id,text:renderNode(node)});
  }
  return boxes;
}
