export type EditorLayoutSettings={pageSize:'A3'|'A4'|'A5'|'B5'|'Letter'|'Legal'|'Executive'|'Tabloid';orientation:'portrait'|'landscape';margin:number;headerText:string;footerText:string;showPageNumbers:boolean;fontFamily:string;headerAlign?:'left'|'center'|'right';footerAlign?:'left'|'center'|'right'};
const marker='<!--kz-layout:v1:';
export function attachLayoutMetadata(html:string,settings:EditorLayoutSettings):string{
  const clean=stripLayoutMetadata(html);
  return marker+encodeURIComponent(JSON.stringify(settings))+'-->\n'+clean;
}
export function parseLayoutMetadata(content:string):EditorLayoutSettings|null{
  const match=content.match(/^\s*<!--kz-layout:v1:([^>]+)-->/);
  if(!match)return null;
  try{
    const value=JSON.parse(decodeURIComponent(match[1]));
    if((!['A3','A4','A5','B5','Letter','Legal','Executive','Tabloid'].includes(value.pageSize))||(value.orientation!=='portrait'&&value.orientation!=='landscape')||!Number.isFinite(value.margin)||value.margin<0||value.margin>50||typeof value.headerText!=='string'||typeof value.footerText!=='string'||typeof value.showPageNumbers!=='boolean'||typeof value.fontFamily!=='string'||(value.headerAlign!==undefined&&!['left','center','right'].includes(value.headerAlign))||(value.footerAlign!==undefined&&!['left','center','right'].includes(value.footerAlign)))return null;
    return {...value,headerAlign:value.headerAlign||'left',footerAlign:value.footerAlign||'left'} as EditorLayoutSettings;
  }catch{return null}
}
export function stripLayoutMetadata(content:string):string{
  return content.replace(/^\s*<!--kz-layout:v1:[^>]+-->\s*/,'');
}
