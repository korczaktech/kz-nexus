import '../services/browserGlobals';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {normalizeHtmlForDocx} from './editorFormats';
import * as mammoth from 'mammoth';
import {Buffer} from 'node:buffer';

describe('DOCX import/export round-trip',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('retains common structure and inline formatting',async()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    const mod=await import('@turbodocx/html-to-docx');
    const convert=(mod as any).default||mod;
    const html=normalizeHtmlForDocx('<h1>Relatório</h1><p>Texto <strong>forte</strong> e <em>itálico</em>.</p><ul><li>Primeiro</li><li>Segundo</li></ul><table><tr><td>A</td><td>B</td></tr></table>');
    const output=await convert('<html><body>'+html+'</body></html>',null,{});
    const arrayBuffer=output instanceof Blob?await output.arrayBuffer():await new Blob([output as BlobPart]).arrayBuffer();
    const result=await mammoth.convertToHtml({buffer:Buffer.from(arrayBuffer)});
    expect(result.value).toContain('Relatório');
    expect(result.value).toMatch(/<strong>forte<\/strong>|<b>forte<\/b>/);
    expect(result.value).toMatch(/<em>itálico<\/em>|<i>itálico<\/i>/);
    expect(result.value).toContain('Primeiro');
    expect(result.value).toContain('Segundo');
    expect(result.value).toContain('<table>');
  },15000);
  it('retains embedded raster images through DOCX export and import',async()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    const mod=await import('@turbodocx/html-to-docx');
    const convert=(mod as any).default||mod;
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7V8AAAAASUVORK5CYII=';
    const html=normalizeHtmlForDocx('<p><img src="'+png+'" alt="pixel"></p>');
    const output=await convert('<html><body>'+html+'</body></html>',null,{});
    const arrayBuffer=output instanceof Blob?await output.arrayBuffer():await new Blob([output as BlobPart]).arrayBuffer();
    const result=await mammoth.convertToHtml({buffer:Buffer.from(arrayBuffer)});
    expect(result.value).toContain('<img');
  },15000);
});
