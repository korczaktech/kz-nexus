import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Window} from 'happy-dom';
import {API_BASE_URL,ApiError,api,clearToken,getToken,saveSession,type Session} from './api';

describe('API client — autenticação e tratamento de falhas',()=>{
  let window:Window;
  let fetchMock:ReturnType<typeof vi.fn>;

  beforeEach(()=>{
    window=new Window();
    vi.stubGlobal('localStorage',window.localStorage);
    const mock=vi.fn();
    fetchMock=mock;
    vi.stubGlobal('fetch',mock);
  });

  afterEach(()=>{
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.close();
  });

  it('envia o token salvo como Bearer nas requisições autenticadas',async()=>{
    const session={token:'session-token',expires_at:'2099-01-01T00:00:00Z',user:{}} as Session;
    saveSession(session);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({id:'u1',name:'Usuário'}),{status:200}));
    await api.me();
    expect(String(fetchMock.mock.calls[0][0])).toBe(API_BASE_URL+'/api/v1/users/me');
    const [,init]=fetchMock.mock.calls[0] as [string,RequestInit];
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer session-token');
  });

  it('remove o token local quando o servidor responde 401',async()=>{
    saveSession({token:'expired-token',expires_at:'2020-01-01T00:00:00Z',user:{}} as Session);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({error:{message:'Sessão expirada',code:'unauthorized'}}),{status:401}));
    await expect(api.me()).rejects.toMatchObject({name:'ApiError',status:401,code:'unauthorized'});
    expect(getToken()).toBeNull();
  });

  it('preserva a sessão e expõe erro controlado quando a API responde 503',async()=>{
    saveSession({token:'session-token',expires_at:'2099-01-01T00:00:00Z',user:{}} as Session);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({error:{message:'Serviço temporariamente indisponível.',code:'service_unavailable'}}),{status:503,headers:{'Content-Type':'application/json'}}));
    await expect(api.documents()).rejects.toMatchObject({name:'ApiError',status:503,code:'service_unavailable',message:'Serviço temporariamente indisponível.'});
    expect(getToken()).toBe('session-token');
  });

  it('aborta requisições que excedem 30 segundos e devolve erro de timeout controlado',async()=>{
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input:RequestInfo|URL,init?:RequestInit)=>new Promise((_resolve,reject)=>{
      init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    }));
    const pending=api.health();
    const assertion=expect(pending).rejects.toMatchObject({name:'ApiError',status:408,code:'request_timeout',message:'A operação excedeu o tempo limite.'});
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
    vi.useRealTimers();
  });

  it('retorna erro seguro quando a API devolve conteúdo que não é JSON',async()=>{
    fetchMock.mockResolvedValue(new Response('<html>upstream failure</html>',{status:502}));
    const error=await api.health().catch((value:unknown)=>value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status:502});
    expect((error as Error).message).toBe('Não foi possível concluir a operação.');
    expect((error as Error).message).not.toContain('upstream failure');
  });

  it('codifica IDs de documentos antes de montar a URL',async()=>{
    fetchMock.mockResolvedValue(new Response(JSON.stringify({id:'folder/a'}),{status:200}));
    await api.document('folder/a');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/documents/folder%2Fa');
  });

  it('limpa a credencial explicitamente ao encerrar a sessão local',()=>{
    saveSession({token:'session-token',expires_at:'2099-01-01T00:00:00Z',user:{}} as Session);
    clearToken();
    expect(getToken()).toBeNull();
  });
});
