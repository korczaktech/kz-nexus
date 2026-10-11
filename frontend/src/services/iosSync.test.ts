import {describe,expect,it} from 'vitest';
import {isSuccessfulIOSSyncResponse} from './iosSync';

describe('fila de sincronização offline do iOS',()=>{
  it('considera sucesso somente respostas HTTP 2xx',()=>{
    for(const status of [200,201,202,204]) expect(isSuccessfulIOSSyncResponse(status)).toBe(true);
  });

  it('não trata erros de autenticação, validação, conflito ou servidor como sincronizados',()=>{
    for(const status of [400,401,403,404,409,422,429,500,502,503]) {
      expect(isSuccessfulIOSSyncResponse(status),String(status)).toBe(false);
    }
  });
});
