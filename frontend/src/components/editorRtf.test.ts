import {describe,expect,it} from 'vitest';
import {parseRtfToHtml} from './editorRtf';

describe('RTF import',()=>{
  it('preserves bold, italic, underline, paragraphs and escapes text',()=>{
    const html=parseRtfToHtml(String.raw`{\rtf1\ansi{\b Forte} e {\i itálico} {\ul sublinhado}\par <seguro>}`);
    expect(html).toContain('<strong>Forte</strong>');
    expect(html).toContain('<em>itálico</em>');
    expect(html).toContain('<u>sublinhado</u>');
    expect(html).toContain('&lt;seguro&gt;');
    expect(html).toContain('</p><p>');
  });
  it('decodes Unicode surrogate pairs and escaped braces',()=>{
    const html=parseRtfToHtml(String.raw`{\rtf1\uc1 \u-10179?\u-8704? \{texto\}}`);
    expect(html).toContain('😀');
    expect(html).toContain('{texto}');
  });
});
