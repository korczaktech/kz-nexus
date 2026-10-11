import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToSlideParagraphs,slideShapeText} from './googleSlidesFormatting';
describe('Google Slides text mapping',()=>{
  let window:Window;
  afterEach(()=>{vi.unstubAllGlobals();window?.close()});
  it('keeps each text box as a separate paragraph and retains line breaks',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSlideParagraphs('<p>Title</p><p>Body<br>second line</p><p></p>')).toEqual(['Title','Body\nsecond line','']);
  });
  it('extracts text from Slides API shape objects',()=>{
    expect(slideShapeText({text:{textElements:[{textRun:{content:'Title'}},{textRun:{content:'\n'}}]}})).toBe('Title');
  });
});
