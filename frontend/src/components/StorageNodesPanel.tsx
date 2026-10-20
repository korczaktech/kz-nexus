import {useCallback, useEffect, useState} from 'react';
import {api, type StorageNode} from '../services/api';

function formatDate(value:string|null){
  if(!value)return 'Ainda não conectado';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Data indisponível':date.toLocaleString('pt-BR');
}

export function StorageNodesPanel(){
  const[nodes,setNodes]=useState<StorageNode[]>([]);
  const[loading,setLoading]=useState(true);
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[pairingCode,setPairingCode]=useState('');
  const[expiresAt,setExpiresAt]=useState('');
  const[remainingSeconds,setRemainingSeconds]=useState(0);

  const refresh=useCallback(async()=>{
    setError('');
    try{
      const result=await api.storageNodes();
      setNodes(result.nodes);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível carregar os dispositivos.');
    }finally{
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void refresh()},[refresh]);
  useEffect(()=>{
    if(!expiresAt){setRemainingSeconds(0);return}
    const update=()=>setRemainingSeconds(Math.max(0,Math.ceil((new Date(expiresAt).getTime()-Date.now())/1000)));
    update();
    const timer=window.setInterval(update,1000);
    return()=>window.clearInterval(timer);
  },[expiresAt]);

  async function createCode(){
    setBusy(true);setError('');setNotice('');
    try{
      const result=await api.createStorageNodePairingCode();
      setPairingCode(result.pairing_code);
      setExpiresAt(result.expires_at);
      setNotice('Código criado. Use-o no Note20 em até cinco minutos; ele só pode ser usado uma vez.');
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível criar o código de pareamento.');
    }finally{setBusy(false)}
  }

  async function copyCode(){
    try{
      await navigator.clipboard.writeText(pairingCode);
      setNotice('Código temporário copiado. Ele expira em cinco minutos.');
    }catch{
      setError('Não foi possível copiar automaticamente. Selecione e copie o código exibido.');
    }
  }

  async function revoke(node:StorageNode){
    if(!window.confirm(`Revogar o acesso de “${node.device_name}”? O dispositivo perderá acesso imediatamente.`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await api.revokeStorageNode(node.id);
      setNotice(`Acesso de ${node.device_name} revogado.`);
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível revogar o dispositivo.');
    }finally{setBusy(false)}
  }

  return <section className="storage-nodes-panel" aria-labelledby="storage-nodes-heading">
    <div className="storage-nodes-heading">
      <div><strong id="storage-nodes-heading">Nós de armazenamento</strong><p>Conecte o Note20 como nó remoto. O celular mantém a conexão de saída; não é necessário abrir portas no roteador.</p></div>
      <button type="button" onClick={()=>void refresh()} disabled={loading||busy}>Atualizar</button>
    </div>
    <div className="storage-nodes-pair">
      <button type="button" onClick={()=>void createCode()} disabled={busy}>Gerar código de pareamento</button>
      <small>O código vale por cinco minutos e pode ser usado uma única vez.</small>
      {pairingCode&&remainingSeconds>0&&<div className="storage-pairing-code">
        <code>{pairingCode}</code>
        <button type="button" onClick={()=>void copyCode()}>Copiar código</button>
        <small>Expira em {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</small>
      </div>}
      {pairingCode&&remainingSeconds===0&&<p className="muted">O código expirou. Gere outro para parear um dispositivo.</p>}
    </div>
    {notice&&<p className="storage-nodes-notice" role="status">{notice}</p>}
    {error&&<p className="alert-error" role="alert">{error}</p>}
    <div className="storage-nodes-list">
      {loading?<p className="muted">Carregando dispositivos…</p>:nodes.length===0?<p className="muted">Nenhum dispositivo pareado ainda.</p>:nodes.map(node=><article key={node.id} className="storage-node-item">
        <div className="storage-node-details">
          <strong>{node.device_name}</strong>
          <small>Último sinal: {formatDate(node.last_seen_at)}</small>
          <small>Adicionado: {formatDate(node.created_at)}</small>
        </div>
        <div className="storage-node-actions">
          <span className={`storage-node-status status-${node.status}`}>{node.status==='online'?'Online':node.status==='revoked'?'Revogado':'Offline'}</span>
          {node.status!=='revoked'&&<button type="button" onClick={()=>void revoke(node)} disabled={busy}>Revogar</button>}
        </div>
      </article>)}
    </div>
    <p className="storage-nodes-security">A credencial permanente é salva no espaço privado do Termux. Nunca a compartilhe; revogue o dispositivo aqui se o celular for perdido.</p>
  </section>;
}
