import {describe,expect,it} from 'vitest';
import {compareVersions,versionPlainText} from './App';

describe('versionamento da aplicação',()=>{
  it('compara corretamente o quarto componente da versão',()=>{
    expect(compareVersions('0.0.0.332','0.0.0.331')).toBe(1);
    expect(compareVersions('0.0.0.331','0.0.0.332')).toBe(-1);
    expect(compareVersions('0.0.0.100','0.0.0.99')).toBe(1);
  });

  it('compara componentes numéricos em vez de texto lexical',()=>{
    expect(compareVersions('v1.10.0','v1.9.9')).toBe(1);
    expect(compareVersions('v1.9.9','v1.10.0')).toBe(-1);
    expect(compareVersions('v2.4.1','2.4.1')).toBe(0);
  });

  it('normaliza notas HTML de release para texto legível',()=>{
    expect(versionPlainText('<p>Notas <strong>da versão</strong></p>')).toBe('Notas da versão');
  });
});
