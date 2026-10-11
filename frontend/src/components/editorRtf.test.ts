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
  it('preserves RTF font size and color-table formatting',()=>{
    const html=parseRtfToHtml(String.raw`{\rtf1{\colortbl;\red255\green0\blue0;}\cf1\fs32 Vermelho}`);
    expect(html).toContain('<span style="font-size:16pt;color:#ff0000">Vermelho</span>');
  });

  it('preserves paragraph alignment controls',()=>{
    const html=parseRtfToHtml(String.raw`{\rtf1\qc Centralizado\par\qr Direita}`);
    expect(html).toContain('<p style="text-align:center">Centralizado</p>');
    expect(html).toContain('<p style="text-align:right">Direita</p>');
  });

});
