import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToRtf} from './editorFormats';

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
  it('encodes non-BMP characters as UTF-16 RTF escapes',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const rtf=htmlToRtf('<p>Olá 😀</p>');
    expect(rtf).toContain('\\u-10179?');
    expect(rtf).toContain('\\u-8704?');
  });
});
