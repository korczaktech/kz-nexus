import {useCallback, useEffect, useState} from 'react';
import {api, type StorageNode} from '../services/api';
import type {StorageSelection} from '../services/storage';

type Props = {
  guest: boolean;
  selection: StorageSelection | null;
};

function StatusPill({online, label}: {online: boolean; label?: string}) {
  return <span className={`storage-status-pill ${online ? 'is-online' : 'is-offline'}`}>{label || (online ? 'On-Line' : 'Off-Line')}</span>;
}

export function StorageStatusCard({guest, selection}: Props) {
  const [nodes, setNodes] = useState<StorageNode[]>([]);
  const [loading, setLoading] = useState(!guest);
  const [refreshError, setRefreshError] = useState(false);

  const refresh = useCallback(async () => {
    if (guest) {
      setLoading(false);
      return;
    }
    try {
      const result = await api.storageNodes();
      setNodes(result.nodes);
      setRefreshError(false);
    } catch {
      setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }, [guest]);

  useEffect(() => { void refresh(); }, [refresh]);

  const deviceOnline = nodes.some(node => node.status === 'online');

  return <section className="storage-status-card" aria-labelledby="storage-status-heading">
    <div className="storage-status-card-heading">
      <div>
        <strong id="storage-status-heading">Card de Armazenamento</strong>
        <p>Status dos provedores de armazenamento e do dispositivo vinculado.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading || guest}>Atualizar</button>
    </div>
    <div className="storage-status-list">
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon google">G</span><span><strong>Google Drive</strong><small>{selection?.provider === 'google-drive' ? 'Selecionado neste navegador' : 'Não conectado neste navegador'}</small></span></span>
        <StatusPill online={selection?.provider === 'google-drive'} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon microsoft">▦</span><span><strong>Microsoft OneDrive</strong><small>Integração não configurada</small></span></span>
        <StatusPill online={false} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon vault">K</span><span><strong>Korczak Vault</strong><small>Servidor I · não conectado</small></span></span>
        <StatusPill online={false} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon device">▣</span><span><strong>Dispositivo</strong><small>{guest ? 'Entre na conta para consultar o estado' : loading ? 'Consultando conexão…' : refreshError ? 'Não foi possível consultar o estado' : nodes.length ? nodes.filter(node => node.status === 'online').map(node => node.device_name).join(', ') : 'Nenhum dispositivo vinculado'}</small></span></span>
        <StatusPill online={!guest && !loading && !refreshError && deviceOnline} label={guest ? 'Indisponível' : loading ? 'Verificando' : refreshError ? 'Indisponível' : undefined} />
      </div>
    </div>
    <p className="storage-status-footnote">OneDrive e Korczak Vault ainda não estão conectados ao site. O estado do dispositivo é consultado no serviço Nexus.</p>
  </section>;
}
