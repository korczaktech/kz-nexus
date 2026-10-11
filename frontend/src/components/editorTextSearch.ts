const BLOCK_TAGS=new Set(['ADDRESS','ARTICLE','ASIDE','BLOCKQUOTE','DIV','DL','FIELDSET','FIGURE','H1','H2','H3','H4','H5','H6','LI','OL','P','PRE','SECTION','TABLE','TD','TH','TR','UL']);
type TextPart={node:Text;start:number;end:number};
type Segment={text:string;nodes:TextPart[]};
function segments(root:HTMLElement):Segment[]{
  const doc=root.ownerDocument,walker=doc.createTreeWalker(root,4);
  const result:Segment[]=[];let current:Segment|null=null;let currentBlock:Element|null=null;let node:Node|null;
  while((node=walker.nextNode())){
    const textNode=node as Text;if(!textNode.data)continue;
    let parent=textNode.parentElement;
    while(parent&&parent!==root&&!BLOCK_TAGS.has(parent.tagName))parent=parent.parentElement;
    const block=parent||root;if(current&&block!==currentBlock)current=null;
    if(!current){current={text:'',nodes:[]};result.push(current);currentBlock=block}
    const start=current.text.length;current.text+=textNode.data;current.nodes.push({node:textNode,start,end:current.text.length});
  }
  return result;
}
function rangeFor(segment:Segment,start:number,end:number):Range{
  const startPart=segment.nodes.find(part=>start>=part.start&&start<part.end)||segment.nodes[segment.nodes.length-1];
  const endPart=segment.nodes.find(part=>end>part.start&&end<=part.end)||segment.nodes[segment.nodes.length-1];
  const range=startPart.node.ownerDocument!.createRange();
  range.setStart(startPart.node,Math.max(0,start-startPart.start));
  range.setEnd(endPart.node,Math.min(endPart.node.data.length,end-endPart.start));
  return range;
}
export function findTextMatches(root:HTMLElement,query:string):{count:number;firstRange:Range|null}{
  if(!query)return{count:0,firstRange:null};
  const needle=query.toLocaleLowerCase();let count=0;let firstRange:Range|null=null;
  for(const segment of segments(root)){
    const hay=segment.text.toLocaleLowerCase();let at=0;
    while((at=hay.indexOf(needle,at))!==-1){count++;if(!firstRange)firstRange=rangeFor(segment,at,at+query.length);at+=Math.max(needle.length,1)}
  }
  return{count,firstRange};
}
export function replaceTextAcrossBlocks(root:HTMLElement,query:string,replacement:string):number{
  if(!query)return 0;
  const needle=query.toLocaleLowerCase();const matches:{segment:Segment;start:number;end:number}[]=[];
  for(const segment of segments(root)){
    const hay=segment.text.toLocaleLowerCase();let at=0;
    while((at=hay.indexOf(needle,at))!==-1){matches.push({segment,start:at,end:at+query.length});at+=Math.max(needle.length,1)}
  }
  for(const match of matches.reverse()){
    const startPart=match.segment.nodes.find(part=>match.start>=part.start&&match.start<part.end)||match.segment.nodes[match.segment.nodes.length-1];
    const endPart=match.segment.nodes.find(part=>match.end>part.start&&match.end<=part.end)||match.segment.nodes[match.segment.nodes.length-1];
    const startOffset=Math.max(0,match.start-startPart.start),endOffset=Math.min(endPart.node.data.length,match.end-endPart.start);
    if(startPart.node===endPart.node){const value=startPart.node.data;startPart.node.data=value.slice(0,startOffset)+replacement+value.slice(endOffset);continue}
    const startValue=startPart.node.data,endValue=endPart.node.data;
    startPart.node.data=startValue.slice(0,startOffset)+replacement;
    endPart.node.data=endValue.slice(endOffset);
    const startIndex=match.segment.nodes.indexOf(startPart),endIndex=match.segment.nodes.indexOf(endPart);
    for(let i=startIndex+1;i<endIndex;i++)match.segment.nodes[i].node.data='';
  }
  root.querySelectorAll('strong,em,b,i,u,s,del,span,sub,sup').forEach(element=>{if(!(element.textContent||'').length&&!element.querySelector('img,br'))element.remove()});
  return matches.length;
}
