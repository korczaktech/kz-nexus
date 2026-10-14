import {describe,expect,it} from 'vitest';
import {characterDeletionRange,normalizeTextRange,wordDeletionRange} from './editorSelection';

describe('Kortex editor selection helpers',()=>{
  it('normalizes forward and reversed selections to the same range',()=>{
    expect(normalizeTextRange(2,7)).toEqual({start:2,end:7});
    expect(normalizeTextRange(7,2)).toEqual({start:2,end:7});
  });
  it('clamps invalid and negative DOM offsets safely',()=>{
    expect(normalizeTextRange(-3,4)).toEqual({start:0,end:4});
    expect(normalizeTextRange(Number.NaN,Number.POSITIVE_INFINITY)).toEqual({start:0,end:0});
  });
  it('deletes a full Unicode character instead of half a surrogate pair',()=>{
    expect(characterDeletionRange('A😀B',3,'backward')).toEqual({start:1,end:3});
    expect(characterDeletionRange('A😀B',1,'forward')).toEqual({start:1,end:3});
    expect(characterDeletionRange('A😀B',0,'backward')).toEqual({start:0,end:0});
    expect(characterDeletionRange('A😀B',4,'forward')).toEqual({start:4,end:4});
  });
  it('deletes a combining sequence as one visible character',()=>{
    const text='Ae\u0301B';
    expect(characterDeletionRange(text,3,'backward')).toEqual({start:1,end:3});
    expect(characterDeletionRange(text,1,'forward')).toEqual({start:1,end:3});
  });
  it('deletes joined emoji and flags as single grapheme clusters',()=>{
    const family='👨‍👩‍👧‍👦';
    expect(characterDeletionRange('A'+family+'B',1,'forward')).toEqual({start:1,end:1+family.length});
    expect(characterDeletionRange('A'+family+'B',1+family.length,'backward')).toEqual({start:1,end:1+family.length});
    const flag='🇧🇷';
    expect(characterDeletionRange(flag,flag.length,'backward')).toEqual({start:0,end:flag.length});
  });
  it('deletes the preceding word and its separating whitespace',()=>{
    expect(wordDeletionRange('um texto aqui',8,'backward')).toEqual({start:3,end:8});
    expect(wordDeletionRange('palavra   ',10,'backward')).toEqual({start:0,end:10});
  });
  it('deletes the next word and leading whitespace while respecting whitespace boundaries',()=>{
    expect(wordDeletionRange('um   texto aqui',2,'forward')).toEqual({start:2,end:10});
    expect(wordDeletionRange('texto aqui',0,'forward')).toEqual({start:0,end:5});
    expect(wordDeletionRange('texto aqui',5,'forward')).toEqual({start:5,end:10});
  });
  it('keeps ranges inside text boundaries and handles empty text',()=>{
    expect(wordDeletionRange('abc',-5,'backward')).toEqual({start:0,end:0});
    expect(wordDeletionRange('abc',50,'forward')).toEqual({start:3,end:3});
    expect(wordDeletionRange('',0,'forward')).toEqual({start:0,end:0});
  });
});
