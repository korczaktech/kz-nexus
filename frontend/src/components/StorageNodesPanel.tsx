import {useCallback, useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {api, type StorageNode} from '../services/api';

function formatDate(value:string|null){
  if(!value)return 'Ainda não conectado';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Data indisponível':date.toLocaleString('pt-BR');
}

function serverLabel(node:StorageNode){
  const name=node.device_name.trim().toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' ');
  if(name==='servidor i'||name==='server i'||name==='servidor 1'||name==='server 1'||name.includes('note20'))return 'Servidor I';
  if(name==='servidor ii'||name==='server ii'||name==='servidor 2'||name==='server 2'||name.includes('galaxy j8'))return 'Servidor II';
  return node.device_name;
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
  const[openMenu,setOpenMenu]=useState<string|null>(null);
  const[menuPosition,setMenuPosition]=useState<{top:number;left:number}|null>(null);

  const refresh=useCallback(async()=>{
    setError('');
    try{
      const result=await api.storageNodes();
      setNodes(result.nodes);
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível carregar os servidores.');
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
      setNotice('Código criado. Ele vale por cinco minutos e só pode ser usado uma vez.');
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
    const label=serverLabel(node);
    setOpenMenu(null);setMenuPosition(null);
    if(!window.confirm(`Revogar o acesso de “${label}”? O dispositivo perderá acesso à API até ser pareado novamente.`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await api.revokeStorageNode(node.id);
      setNotice(`Acesso de ${label} revogado.`);
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível revogar o servidor.');
    }finally{setBusy(false)}
  }

  async function toggleSaving(node:StorageNode){
    const label=serverLabel(node);
    const enabled=node.saving_enabled===false;
    setOpenMenu(null);setMenuPosition(null);setBusy(true);setError('');setNotice('');
    try{
      await api.setStorageNodeSaving(node.id,enabled);
      setNodes(current=>current.map(item=>item.id===node.id?{...item,saving_enabled:enabled}:item));
      setNotice(enabled?`Gravações retomadas em ${label}.`:`Gravações pausadas em ${label}. O agente continuará conectado.`);
      await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:'Não foi possível alterar a permissão de gravação.');
      await refresh();
    }finally{setBusy(false)}
  }

  const onlineCount=nodes.filter(node=>node.status==='online').length;
  const activeCount=nodes.filter(node=>node.status!=='revoked').length;

  return <section className="storage-nodes-panel" aria-labelledby="storage-nodes-heading">
    <header className="storage-nodes-hero">
      <div className="storage-nodes-hero-copy">
        <span className="storage-nodes-kicker">INFRAESTRUTURA · KORCZAK NEXUS</span>
        <h2 id="storage-nodes-heading">Servidores</h2>
        <p>Gerencie a conexão dos servidores e pause ou retome as gravações sem desligar os agentes no celular.</p>
      </div>
      <button className="storage-nodes-refresh" type="button" onClick={()=>void refresh()} disabled={loading||busy}>
        <span aria-hidden="true">↻</span> Atualizar
      </button>
      <div className="storage-nodes-hero-mark" aria-hidden="true"><span>KN</span><i/><i/><i/></div>
    </header>

    <div className="storage-nodes-summary" aria-label="Resumo dos servidores">
      <article className="storage-nodes-metric"><span className="storage-nodes-metric-icon">◉</span><div><small>Servidores online</small><strong>{loading?'—':onlineCount}</strong></div><span className="storage-nodes-metric-note">Conectados agora</span></article>
      <article className="storage-nodes-metric"><span className="storage-nodes-metric-icon">▤</span><div><small>Servidores cadastrados</small><strong>{loading?'—':activeCount}</strong></div><span className="storage-nodes-metric-note">Acesso não revogado</span></article>
    </div>

    <section className="storage-nodes-section" aria-labelledby="storage-nodes-list-heading">
      <div className="storage-nodes-section-heading"><div><span className="storage-nodes-kicker">ESTADO DA REDE</span><h3 id="storage-nodes-list-heading">Seus servidores</h3></div><span className="storage-nodes-live"><i/> Atualização manual</span></div>
      {loading?<div className="storage-nodes-empty"><span className="storage-nodes-loader"/>Carregando servidores…</div>:nodes.length===0?<div className="storage-nodes-empty"><span className="storage-nodes-empty-icon">▤</span><strong>Nenhum servidor pareado</strong><p>Gere um código de pareamento para conectar o primeiro servidor.</p></div>:<div className="storage-nodes-list">
        {nodes.map(node=>{
          const label=serverLabel(node);
          const online=node.status==='online';
          const revoked=node.status==='revoked';
          const savingEnabled=node.saving_enabled!==false;
          return <article key={node.id} className={`storage-node-item${online?' is-online':''}${revoked?' is-revoked':''}`}>
            <div className="storage-node-glyph" aria-hidden="true"><span>▤</span><i/></div>
            <div className="storage-node-details"><div className="storage-node-title"><strong>{label}</strong><span className={`storage-node-status status-${node.status}`}><i/>{online?'Online':revoked?'Acesso revogado':'Offline'}</span>{!revoked&&<span className={`storage-node-status ${savingEnabled?'status-saving-on':'status-saving-paused'}`}><i/>{savingEnabled?'Gravações ativas':'Gravações pausadas'}</span>}{node.shared&&<span className="storage-node-status">Armazenamento compartilhado</span>}</div><p>Último sinal <span>{formatDate(node.last_seen_at)}</span></p><p>Adicionado <span>{formatDate(node.created_at)}</span></p></div>
            <div className="storage-node-actions">{!revoked&&node.can_manage!==false&&<div className="storage-node-menu-wrap">
              <button type="button" className="storage-node-revoke" aria-haspopup="menu" aria-expanded={openMenu===node.id} onClick={event=>{if(openMenu===node.id){setOpenMenu(null);setMenuPosition(null);return}const rect=event.currentTarget.getBoundingClientRect();const menuWidth=Math.min(280,window.innerWidth-24);setMenuPosition({top:Math.min(rect.bottom+7,window.innerHeight-150),left:Math.max(12,Math.min(rect.right-menuWidth,window.innerWidth-menuWidth-12))});setOpenMenu(node.id)}} disabled={busy}>Ações <span aria-hidden="true">⌄</span></button>
              {openMenu===node.id&&menuPosition&&createPortal(<><button type="button" className="storage-node-menu-backdrop" aria-label="Fechar menu" onClick={()=>{setOpenMenu(null);setMenuPosition(null)}}/><div className="storage-node-menu" role="menu" aria-label={`Ações para ${label}`} style={{position:'fixed',top:menuPosition.top,left:menuPosition.left,right:'auto'}}>
                <button type="button" role="menuitem" onClick={()=>void toggleSaving(node)}><span className="storage-node-menu-icon">{savingEnabled?'Ⅱ':'▶'}</span><span><strong>{savingEnabled?'Pausar gravações':'Retomar gravações'}</strong><small>{savingEnabled?'Bloquear novos salvamentos neste servidor':'Permitir novos salvamentos neste servidor'}</small></span></button>
                <button type="button" role="menuitem" className="is-danger" onClick={()=>void revoke(node)}><span className="storage-node-menu-icon">⊘</span><span><strong>Revogar acesso</strong><small>Invalidar a credencial do nó</small></span></button>
              </div></>,document.body)}
            </div>}</div>
          </article>;
        })}
      </div>}
    </section>

    <section className="storage-nodes-pair-section" aria-labelledby="storage-nodes-pair-heading">
      <div className="storage-nodes-pair-copy"><span className="storage-nodes-kicker">ADICIONAR DISPOSITIVO</span><h3 id="storage-nodes-pair-heading">Parear um servidor</h3><p>Crie um código temporário e insira-o no Termux do dispositivo que deseja conectar. O código expira em cinco minutos e só pode ser usado uma vez.</p><button type="button" className="storage-nodes-primary" onClick={()=>void createCode()} disabled={busy}><span aria-hidden="true">＋</span> Gerar código de pareamento</button></div>
      <div className="storage-nodes-pair-visual" aria-hidden="true"><div className="storage-pair-orbit orbit-a"/><div className="storage-pair-orbit orbit-b"/><div className="storage-pair-device">KN</div><span className="storage-pair-dot dot-a"/><span className="storage-pair-dot dot-b"/></div>
      {pairingCode&&remainingSeconds>0&&<div className="storage-pairing-code"><div><small>CÓDIGO TEMPORÁRIO</small><code>{pairingCode}</code><span>Expira em {Math.floor(remainingSeconds/60)}:{String(remainingSeconds%60).padStart(2,'0')}</span></div><button type="button" onClick={()=>void copyCode()}>Copiar código</button></div>}
      {pairingCode&&remainingSeconds===0&&<p className="storage-pair-expired">O código expirou. Gere outro para parear um servidor.</p>}
    </section>

    {notice&&<p className="storage-nodes-notice" role="status"><span aria-hidden="true">✓</span>{notice}</p>}
    {error&&<p className="storage-nodes-error" role="alert">{error}</p>}
    <p className="storage-nodes-security"><span aria-hidden="true">▣</span><span><strong>Segurança do armazenamento</strong><br/>Pausar bloqueia novos salvamentos e cancela tarefas ainda não iniciadas. O agente continua conectado; uma gravação já iniciada pode terminar antes de a pausa surtir efeito. Revogue o acesso se um dispositivo for perdido.</span></p>
  </section>;
}
