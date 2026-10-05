import {describe,expect,it,beforeEach} from 'vitest';
import {getStorageSelection,saveStorageSelection,storageLabel} from './storage';

describe('storage selection',()=>{
  beforeEach(()=>localStorage.clear());

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
