import {createDocument} from '../../../packages/engine/src/index';
import {htmlFromNexusDocument} from '../services/nexusEngineAdapter';
import {describe,expect,it} from 'vitest';
import {resolveEditorInitialHtml,toRtf} from './Editor';
import {markdownToHtml} from './markdown';

describe('Fase 8 - editor',()=>{
  it('uses the native structured model as source of truth over stale legacy HTML',()=>{
    const model=createDocument({title:'Canonical model'});
    const paragraph=model.content[0];
    if(!paragraph||paragraph.type!=='paragraph')throw new Error('Expected default paragraph');
    paragraph.children[0]!.text='CONTENT_FROM_MODEL';
    const nativeHtml=htmlFromNexusDocument(model);
    const resolved=resolveEditorInitialHtml(model,'<p>STALE_HTML</p>');
    expect(resolved).toBe(nativeHtml);
    expect(resolved).toContain('CONTENT_FROM_MODEL');
    expect(resolved).not.toContain('STALE_HTML');
  });

  it('falls back to legacy content only when there is no valid native model',()=>{
    expect(resolveEditorInitialHtml(null,'<p>LEGACY_CONTENT</p>')).toBe('<p>LEGACY_CONTENT</p>');
    expect(resolveEditorInitialHtml(null,null)).toBe('');
  });

  it('does not mask a corrupt native payload with stale HTML',()=>{
    expect(resolveEditorInitialHtml(null,'<p>STALE_HTML</p>',true)).toBe('');
  });
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
  it('escapa caracteres especiais ao exportar RTF',()=>{
    const rtf=toRtf('A {b}\\c\nç');
    expect(rtf).toContain('\\{b\\}');
    expect(rtf).toContain('\\\\c');
    expect(rtf).toContain('\\u231?');
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
  });

});
