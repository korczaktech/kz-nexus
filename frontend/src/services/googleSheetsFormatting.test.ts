import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToSpreadsheetValues} from './googleSheetsFormatting';

describe('Google Sheets cell conversion',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('parses CSV quoting, commas, escaped quotes and line breaks',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetValues('<p>name,note</p><p>"Korczak, Tech","said ""hello"""</p>')).toEqual([['name','note'],['Korczak, Tech','said "hello"']]);
  });
  it('reads an inserted editor table as rows and cells',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSpreadsheetValues('<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>')).toEqual([['Name','Value'],['A','1']]);
  });
});
