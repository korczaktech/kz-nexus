import {describe,expect,it} from 'vitest';
import {mergeDocumentContent} from './editorMerge';
describe('three-way editor merge',()=>{
  it('keeps independent paragraph edits from both sessions',()=>{
    const base='<p>A</p><p>B</p><p>C</p>';
    const local='<p>A local</p><p>B</p><p>C</p>';
    const remote='<p>A</p><p>B</p><p>C remote</p>';
    const result=mergeDocumentContent(base,local,remote);
    expect(result.merged).toBe(true);
    expect(result.content).toContain('<p>A local</p>');
    expect(result.content).toContain('<p>C remote</p>');
  });
  it('reports conflicting edits to the same paragraph instead of discarding either',()=>{
    const base='<p>Original</p>';
    const result=mergeDocumentContent(base,'<p>Local</p>','<p>Remote</p>');
    expect(result.merged).toBe(false);
    expect(result.content).toBe('<p>Local</p>');
    expect(result.reason).toMatch(/mesma parte/);
  });
  it('returns the changed side when the other side did not change',()=>{
    expect(mergeDocumentContent('<p>A</p>','<p>B</p>','<p>A</p>')).toEqual({merged:true,content:'<p>B</p>'});
  });
});
