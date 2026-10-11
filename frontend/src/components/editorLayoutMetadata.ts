export type EditorLayoutSettings={pageSize:'A4'|'Letter';orientation:'portrait'|'landscape';margin:number;headerText:string;footerText:string;showPageNumbers:boolean;fontFamily:string};
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
    if((value.pageSize!=='A4'&&value.pageSize!=='Letter')||(value.orientation!=='portrait'&&value.orientation!=='landscape')||![10,15,20,25,30].includes(value.margin)||typeof value.headerText!=='string'||typeof value.footerText!=='string'||typeof value.showPageNumbers!=='boolean'||typeof value.fontFamily!=='string')return null;
    return value as EditorLayoutSettings;
  }catch{return null}
}
export function stripLayoutMetadata(content:string):string{
  return content.replace(/^\s*<!--kz-layout:v1:[^>]+-->\s*/,'');
}
