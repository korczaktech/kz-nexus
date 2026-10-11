import {describe,expect,it} from 'vitest';
import {htmlToMarkdown,markdownToHtml,toRtf} from './Editor';

describe('Fase 8 - editor',()=>{
  it('renderiza conteúdo formatado sem interpretar HTML bruto',()=>{
    const html=markdownToHtml('# Título\n\n**forte** e *itálico*\n\n- item');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>forte</strong>');
    expect(html).toContain('<em>itálico</em>');
    expect(html).toContain('<ul>');
    expect(html).not.toContain('<script>');
  });
  it('escapa conteúdo potencialmente perigoso',()=>{
    const html=markdownToHtml('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });
  it('suporta documentos grandes',()=>{
    const source='texto '.repeat(100000);
    expect(markdownToHtml(source).length).toBeGreaterThan(500000);
  });
  it('suporta tabela, código e links',()=>{
    const html=markdownToHtml('| A | B |\n| --- | --- |\n| 1 | 2 |\n`codigo`\n[link](https://example.com)');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>1</td>');
    expect(html).toContain('<code>codigo</code>');
    expect(html).toContain('https://example.com');
  });
  it('exporta Markdown preservando títulos, ênfase, listas e links',()=>{
    const source='<h1>Relatório</h1><p>Texto <strong>forte</strong> e <em>ênfase</em>.</p><ul><li>Primeiro</li><li>Segundo</li></ul><p><a href="https://example.com">Site</a></p>';
    const markdown=htmlToMarkdown(source);
    expect(markdown).toContain('# Relatório');
    expect(markdown).toContain('**forte**');
    expect(markdown).toContain('*ênfase*');
    expect(markdown).toContain('- Primeiro');
    expect(markdown).toContain('[Site](https://example.com)');
  });
  it('escapa caracteres especiais ao exportar RTF',()=>{
    const rtf=toRtf('A {b}\\c\nç');
    expect(rtf).toContain('\\{b\\}');
    expect(rtf).toContain('\\\\c');
    expect(rtf).toContain('\\u231?');
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
  });

});
