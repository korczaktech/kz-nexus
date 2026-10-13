import {describe,expect,it} from 'vitest';
import {attachLayoutMetadata,parseLayoutMetadata,stripLayoutMetadata,type EditorLayoutSettings} from './editorLayoutMetadata';
const layout:EditorLayoutSettings={pageSize:'Letter',orientation:'landscape',margin:20,headerText:'Relatório --> final',footerText:'Korczak',showPageNumbers:true,fontFamily:'Georgia',footerAlign:'left'};
describe('document layout metadata',()=>{
  it('round-trips page settings without changing visible HTML',()=>{
    const html='<p>Conteúdo</p>';
    const saved=attachLayoutMetadata(html,layout);
    expect(parseLayoutMetadata(saved)).toEqual(layout);
    expect(stripLayoutMetadata(saved)).toBe(html);
  });
  it('ignores invalid or unsupported metadata safely',()=>{
    expect(parseLayoutMetadata('<!--kz-layout:v1:not-json--><p>Text</p>')).toBeNull();
    expect(stripLayoutMetadata('<p>Text</p>')).toBe('<p>Text</p>');
  });
});
