import {describe,expect,it} from 'vitest';
import {pdfTextItemsToHtml} from './editorPdf';

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
});
