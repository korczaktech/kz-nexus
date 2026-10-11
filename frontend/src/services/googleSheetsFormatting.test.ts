import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToPlainText,htmlToSpreadsheetTables,htmlToSpreadsheetValues} from './googleSheetsFormatting';

describe('Google Sheets cell conversion',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('parses CSV quoting, commas, escaped quotes and line breaks',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetValues('<p>name,note</p><p>"Korczak, Tech","said ""hello"""</p>')).toEqual([['name','note'],['Korczak, Tech','said "hello"']]);
  });
  it('ignores embedded layout metadata when exporting sheet cells',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetValues('<!--kz-layout:v1:eyJwYWdlU2l6ZSI6IkE0In0=--><p>name,value</p><p>A,1</p>')).toEqual([['name','value'],['A','1']]);
  });
  it('keeps paragraph boundaries when exporting plain text',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToPlainText('<p>linha um</p><p>linha dois<br>continuação</p>')).toBe('linha um\nlinha dois\ncontinuação');
  });
  it('reads an inserted editor table as rows and cells',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetValues('<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>')).toEqual([['Name','Value'],['A','1']]);
  });
  it('reads every sheet by stable sheet ID',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetTables('<table data-google-sheet-id="22" data-google-sheet-title="Resumo"><tr><td>Total</td></tr></table><table data-google-sheet-id="11" data-google-sheet-title="Dados"><tr><td>Nome</td><td>Valor</td></tr></table>')).toEqual([
      {sheetId:'22',title:'Resumo',values:[['Total']]},
      {sheetId:'11',title:'Dados',values:[['Nome','Valor']]}
    ]);
  });
  it('rejects tables without stable source identity',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(()=>htmlToSpreadsheetTables('<table><tr><td>Dados</td></tr></table>')).toThrow(/identificador/);
  });

  it('preserves intentional leading and trailing whitespace inside cells',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetTables('<table data-google-sheet-id="1" data-google-sheet-title="Dados"><tr><td>  valor  </td></tr></table>')[0].values).toEqual([['  valor  ']]);
  });

});
