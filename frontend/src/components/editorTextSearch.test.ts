import {afterEach,describe,expect,it} from 'vitest';
import {Window} from 'happy-dom';
import {findTextMatches,replaceTextAcrossBlocks} from './editorTextSearch';

describe('editor text search',()=>{
  let window:Window;
  let root:HTMLElement;
  afterEach(()=>{window?.close()});
  function setup(html:string){window=new Window();root=window.document.createElement('div');root.innerHTML=html;return root}
  it('finds text split across inline formatting',()=>{
    const el=setup('<p>Korczak <strong>Doc</strong>uments</p><p>Korczak</p>');
    const result=findTextMatches(el,'documents');
    expect(result.count).toBe(1);
    expect(result.firstRange?.toString()).toBe('Documents');
  });
  it('replaces matches spanning styled nodes without changing unrelated paragraphs',()=>{
    const el=setup('<p>Olá <strong>mun</strong><em>do</em>!</p><p>mundo</p>');
    expect(replaceTextAcrossBlocks(el,'mundo','universo')).toBe(2);
    expect(el.innerHTML).toContain('Olá <strong>universo</strong>!');
    expect(el.innerHTML).toContain('<p>universo</p>');
  });
  it('treats the search term literally and case-insensitively',()=>{
    const el=setup('<p>a.b A.B axb</p>');
    expect(replaceTextAcrossBlocks(el,'a.b','X')).toBe(2);
    expect(el.textContent).toBe('X X axb');
  });
  it('does not match across paragraph boundaries',()=>{
    const el=setup('<p>Korczak</p><p>Documents</p>');
    expect(findTextMatches(el,'KorczakDocuments').count).toBe(0);
  });
});
