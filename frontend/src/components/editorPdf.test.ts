import {describe,expect,it} from 'vitest';
import {mergePdfOcrParagraphs,pdfTextItemsToHtml,shouldRunPdfOcr} from './editorPdf';

describe('PDF text extraction',()=>{
  it('reconstructs lines in reading order and escapes HTML',()=>{
    const html=pdfTextItemsToHtml([
      {str:'mundo',transform:[1,0,0,10,50,700],width:30,height:10},
      {str:'Olá',transform:[1,0,0,10,10,700],width:20,height:10},
      {str:'<seguro>',transform:[1,0,0,10,10,680],width:40,height:10}
    ]);
    expect(html).toBe('<p>Olá mundo</p><p>&lt;seguro&gt;</p>');
  });
  it('returns empty HTML when no selectable text exists',()=>{
    expect(pdfTextItemsToHtml([])).toBe('');
  });
  it('requests OCR for sparse text and mixed pages with embedded images',()=>{
    expect(shouldRunPdfOcr('')).toBe(true);
    expect(shouldRunPdfOcr('short text')).toBe(true);
    expect(shouldRunPdfOcr('x'.repeat(200))).toBe(false);
    expect(shouldRunPdfOcr('x'.repeat(200),true)).toBe(true);
    expect(shouldRunPdfOcr('x'.repeat(700),true)).toBe(false);
  });
  it('adds OCR-only paragraphs without duplicating native text',()=>{
    const html=mergePdfOcrParagraphs('<p>Native text</p>','Native text\n\nScanned text');
    expect(html).toContain('<p>Native text</p>');
    expect(html).toContain('<p>Scanned text</p>');
    expect((html.match(/Native text/g)||[]).length).toBe(1);
  });

});
