import {afterEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {htmlToSlideParagraphs,htmlToSlideTextBoxes,slideShapeText} from './googleSlidesFormatting';
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
  it('maps text by stable Slides object ID instead of visual order',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(htmlToSlideTextBoxes('<p data-slide-object-id="shape_b">Second</p><p data-slide-object-id="shape_a">First<br>line</p>')).toEqual([{objectId:'shape_b',text:'Second'},{objectId:'shape_a',text:'First\nline'}]);
  });
  it('refuses new paragraphs without an original object ID instead of overwriting unrelated shapes',()=>{
    window=new Window();vi.stubGlobal('DOMParser',window.DOMParser);
    expect(()=>htmlToSlideTextBoxes('<p data-slide-object-id="shape_a">Known</p><p>New text</p>')).toThrow(/identificador/);
  });
});
