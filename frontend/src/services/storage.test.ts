import {describe,expect,it,beforeEach} from 'vitest';
import {getStorageSelection,saveStorageSelection,storageLabel} from './storage';

function installLocalStorage(){
  const data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem:(key:string)=>data.get(key)??null,
    setItem:(key:string,value:string)=>data.set(key,value),
    removeItem:(key:string)=>data.delete(key),
    clear:()=>data.clear()
  }});
}

describe('storage selection',()=>{
  beforeEach(()=>installLocalStorage());

  it('persists the selected provider',()=>{
    const selection={provider:'google-drive' as const,label:'Google Drive',connectedAt:'2026-10-03T00:00:00.000Z'};
    saveStorageSelection(selection);
    expect(getStorageSelection()).toEqual(selection);
  });

  it('returns human readable provider labels',()=>{
    expect(storageLabel('local')).toBe('Pasta deste dispositivo');
    expect(storageLabel('google-drive')).toBe('Google Drive');
  });
});
