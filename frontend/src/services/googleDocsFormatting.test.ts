import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToGoogleDocsPayload} from './googleDocsFormatting';

describe('Google Docs formatting conversion',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('preserves rich text and heading styles with correct Google Docs indices',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const result=htmlToGoogleDocsPayload('<h1>Título</h1><p>Olá <strong>mundo</strong> <a href="https://example.com">link</a></p>');
    expect(result.text).toBe('Título\nOlá mundo link\n');
    expect(result.requests).toContainEqual({updateParagraphStyle:{range:{startIndex:1,endIndex:8},paragraphStyle:{namedStyleType:'HEADING_1'},fields:'namedStyleType'}});
    expect(result.requests).toContainEqual({updateTextStyle:{range:{startIndex:12,endIndex:17},textStyle:{bold:true},fields:'bold'}});
    expect(result.requests).toContainEqual({updateTextStyle:{range:{startIndex:18,endIndex:22},textStyle:{link:{url:'https://example.com'}},fields:'link'}});
  });
  it('converts lists and tables into readable content',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);vi.stubGlobal('Node',window.Node);
    const result=htmlToGoogleDocsPayload('<ul><li>um</li><li>dois</li></ul><table><tr><td>A</td><td>B</td></tr></table>');
    expect(result.text).toContain('um\ndois\n');
    expect(result.text).toContain('A\tB\n');
    expect(result.requests.some(request=>'createParagraphBullets' in request)).toBe(true);
  });
});
