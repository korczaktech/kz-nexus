export type MergeResult={merged:boolean;content:string;reason?:string};
type Hunk={start:number;end:number;replacement:string[]};
function tokenize(content:string):string[]{
  return content.replace(/(<\/(?:p|h[1-6]|ul|ol|table|blockquote|div|pre|li|tr)>)/gi,'$1\n').split('\n');
}
function diffHunks(base:string[],variant:string[]):Hunk[]{
  if(base.length*variant.length>1_000_000)throw new Error('O documento é grande demais para uma mesclagem automática segura.');
  const dp=Array.from({length:base.length+1},()=>new Uint32Array(variant.length+1));
  for(let i=base.length-1;i>=0;i--)for(let j=variant.length-1;j>=0;j--)dp[i][j]=base[i]===variant[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const hunks:Hunk[]=[];let i=0,j=0;
  while(i<base.length||j<variant.length){
    if(i<base.length&&j<variant.length&&base[i]===variant[j]){i++;j++;continue}
    const start=i,replacement:string[]=[];
    while(i<base.length||j<variant.length){
      if(i<base.length&&j<variant.length&&base[i]===variant[j])break;
      if(j<variant.length&&(i===base.length||dp[i][j+1]>=dp[i+1][j]))replacement.push(variant[j++]);
      else if(i<base.length)i++;
    }
    hunks.push({start,end:i,replacement});
  }
  return hunks;
}
function overlaps(a:Hunk,b:Hunk):boolean{
  if(a.start===a.end&&b.start===b.end)return a.start===b.start;
  return Math.max(a.start,b.start)<Math.min(a.end,b.end);
}
export function mergeDocumentContent(baseContent:string,localContent:string,remoteContent:string):MergeResult{
  if(localContent===remoteContent)return{merged:true,content:localContent};
  if(localContent===baseContent)return{merged:true,content:remoteContent};
  if(remoteContent===baseContent)return{merged:true,content:localContent};
  try{
    const base=tokenize(baseContent),local=diffHunks(base,tokenize(localContent)),remote=diffHunks(base,tokenize(remoteContent));
    const all=[...local,...remote].sort((a,b)=>a.start-b.start||a.end-b.end);
    const unique:Hunk[]=[];
    for(const hunk of all){
      const prior=unique[unique.length-1];
      if(prior&&overlaps(prior,hunk)){
        if(prior.start===hunk.start&&prior.end===hunk.end&&prior.replacement.join('')===hunk.replacement.join(''))continue;
        return{merged:false,content:localContent,reason:'As duas sessões alteraram a mesma parte do documento.'};
      }
      unique.push(hunk);
    }
    let cursor=0;const output:string[]=[];
    for(const hunk of unique){
      if(hunk.start<cursor)return{merged:false,content:localContent,reason:'As alterações se sobrepõem e exigem revisão manual.'};
      output.push(...base.slice(cursor,hunk.start),...hunk.replacement);cursor=hunk.end;
    }
    output.push(...base.slice(cursor));
    return{merged:true,content:output.join('\n')};
  }catch(error){
    return{merged:false,content:localContent,reason:error instanceof Error?error.message:'Não foi possível mesclar automaticamente com segurança.'};
  }
}
