import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToRtf} from './editorFormats';
import {parseRtfToHtml} from './editorRtf';

describe('rich RTF export',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('preserves headings, bold, italic, underline and lists',()=>{
    window=new Window();
    vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const rtf=htmlToRtf('<h1>Título</h1><p><strong>forte</strong> <em>ênfase</em> <u>sublinhado</u></p><ul><li>item</li></ul>');
    expect(rtf).toContain('\\b\\fs36');
    expect(rtf).toContain('\\b forte');
    expect(rtf).toContain('\\i \\u234?nfase');
    expect(rtf).toContain('\\ul sublinhado');
    expect(rtf).toContain('item');
    expect(rtf.startsWith('{\\rtf1')).toBe(true);
  });
  it('preserves font family, size and color from RTF font tables',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const rtf='{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}{\\f1\\froman Times New Roman;}}{\\colortbl;\\red255\\green0\\blue0;}\\f1\\fs28\\cf1 Texto formatado\\par}';
    const html=parseRtfToHtml(rtf);
    expect(html).toContain('font-family:"Times New Roman"');
    expect(html).toContain('font-size:14pt');
    expect(html).toContain('color:#ff0000');
    expect(html).toContain('Texto formatado');
  });
  it('round-trips embedded PNG images through RTF',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const base64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7V8AAAAASUVORK5CYII=';
    const rtf=htmlToRtf('<p><img src="data:image/png;base64,'+base64+'" alt="pixel" width="1" height="1"></p>');
    expect(rtf).toContain('\\pict\\pngblip');
    const html=parseRtfToHtml(rtf);
    expect(html).toContain('data:image/png;base64,'+base64);
  });
  it('encodes non-BMP characters as UTF-16 RTF escapes',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const rtf=htmlToRtf('<p>Olá 😀</p>');
    expect(rtf).toContain('\\u-10179?');
    expect(rtf).toContain('\\u-8704?');
  });
});
