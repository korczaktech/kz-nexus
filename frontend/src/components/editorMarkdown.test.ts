import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToMarkdown} from './Editor';
import {markdownToHtml} from './markdown';

describe('Markdown export and import round-trip',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('preserves headings, inline marks, links, lists and tables',()=>{
    window=new Window();
    vi.stubGlobal('window',window);vi.stubGlobal('document',window.document);vi.stubGlobal('Node',window.Node);vi.stubGlobal('HTMLElement',window.HTMLElement);
    const html='<h1>Relatório</h1><p><strong>forte</strong> e <em>ênfase</em> <a href="https://example.com">link</a></p><ul><li>um</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    const markdown=htmlToMarkdown(html);
    expect(markdown).toContain('# Relatório');
    expect(markdown).toContain('**forte**');
    expect(markdown).toContain('*ênfase*');
    expect(markdown).toContain('[link](https://example.com)');
    expect(markdown).toContain('| A | B |');
    const restored=markdownToHtml(markdown);
    expect(restored).toContain('<h1>Relatório</h1>');
    expect(restored).toContain('<strong>forte</strong>');
    expect(restored).toContain('<table>');
  });
  it('does not preserve unsafe links or executable HTML',()=>{
    window=new Window();
    vi.stubGlobal('window',window);vi.stubGlobal('document',window.document);vi.stubGlobal('Node',window.Node);vi.stubGlobal('HTMLElement',window.HTMLElement);
    const html=markdownToHtml('<p><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });
});
