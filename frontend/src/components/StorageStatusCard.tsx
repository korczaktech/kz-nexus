import {useCallback, useEffect, useState} from 'react';
import {api, type StorageNode} from '../services/api';
import type {StorageSelection} from '../services/storage';

type Props = {
  guest: boolean;
  selection: StorageSelection | null;
};



function StorageIcon({kind}: {kind: 'google' | 'onedrive' | 'vault' | 'device' | 'vault-cloud'}) {
  if (kind === 'google') {
    return <svg className="storage-status-svg" viewBox="0 0 48 48" role="img" aria-label="Google Drive" focusable="false">
      <path fill="#00832D" d="M16.2 6.5h10.1L10.1 34.2 5 25.5z" />
      <path fill="#0066DA" d="M16.2 6.5h10.1L43 34.2H32.8z" />
      <path fill="#00AC47" d="M5 25.5h10.1l-5 8.7H0z" transform="translate(5 0)" />
      <path fill="#2684FC" d="M15.1 34.2H43l-5.1 8.8H10z" />
      <path fill="#EA4335" d="M5 25.5h10.1l-5.1 8.7z" />
      <path fill="#FFBA00" d="M10 34.2h10.1l-5.1 8.8H5z" />
    </svg>;
  }
  if (kind === 'onedrive') {
    return <svg className="storage-status-svg" viewBox="0 0 48 48" role="img" aria-label="Microsoft OneDrive" focusable="false">
      <defs><linearGradient id="onedrive-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#42B7F4"/><stop offset="1" stopColor="#1765C0"/></linearGradient></defs>
      <path fill="#0364B8" d="M18.4 18.5a11.2 11.2 0 0 1 20.7 5.9 8.4 8.4 0 0 1-1.2 16.7H14.2a9.1 9.1 0 0 1-1.1-18.1 11.3 11.3 0 0 1 5.3-4.5z"/>
      <path fill="url(#onedrive-blue)" d="M5.3 25.4a11.2 11.2 0 0 1 19.4-7.6l7.1 8.3-12.4 8.6H9.9a9 9 0 0 1-4.6-9.3z"/>
      <path fill="#1490DF" d="M18.9 34.7 31.8 26l7.2 1.3a7 7 0 0 1-1.1 13.8H14.2z"/>
    </svg>;
  }
  if (kind === 'vault-cloud') {
    return <svg className="storage-status-svg" viewBox="0 0 48 48" role="img" aria-label="Korczak Vault" focusable="false">
      <path d="M13 35h23a8 8 0 0 0 1-16 13 13 0 0 0-25-2 9 9 0 0 0 1 18z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
      <path d="M17 25h14M17 30h9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>;
  }
  if (kind === 'vault') {
    return <svg className="storage-status-svg" viewBox="0 0 48 48" role="img" aria-label="Korczak Vault" focusable="false">
      <path d="M24 3 41 10v12c0 10.6-7 18.1-17 23C14 40.1 7 32.6 7 22V10z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round"/>
      <rect x="14" y="14" width="20" height="6" rx="2" fill="currentColor" opacity=".95"/>
      <rect x="14" y="22" width="20" height="6" rx="2" fill="currentColor" opacity=".72"/>
      <rect x="14" y="30" width="20" height="5" rx="2" fill="currentColor" opacity=".5"/>
      <circle cx="29" cy="17" r="1" fill="#07111e"/><circle cx="29" cy="25" r="1" fill="#07111e"/><circle cx="29" cy="32.5" r="1" fill="#07111e"/>
    </svg>;
  }
  return <svg className="storage-status-svg" viewBox="0 0 48 48" role="img" aria-label="Armazenamento local do dispositivo" focusable="false">
    <rect x="5" y="7" width="38" height="27" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5"/>
    <path d="M18 41h12M24 34v7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="11" y="13" width="26" height="15" rx="2" fill="currentColor" opacity=".14"/>
    <path d="M16 20h16M16 24h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

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

  const localConfigured = selection?.provider === 'local';
  const nexusCloudSelected = selection?.provider === 'vault-cloud';
  const vaultNodes = nodes.filter(node => node.status !== 'revoked');
  const vaultOnline = vaultNodes.some(node => node.status === 'online');
  const vaultSubtitle = guest
    ? 'Entre na conta para consultar os servidores'
    : loading
      ? 'Consultando servidores…'
      : refreshError
        ? 'Não foi possível consultar os servidores'
        : vaultNodes.length
          ? vaultNodes.map((_, index) => `Servidor ${index === 0 ? 'I' : index === 1 ? 'II' : index + 1}`).join(' / ')
          : 'Nenhum servidor Korczak Vault conectado';

  return <section className="storage-status-card" aria-labelledby="storage-status-heading">
    <div className="storage-status-card-heading">
      <div>
        <strong id="storage-status-heading">Card de Armazenamento</strong>
        <p>Serviços em nuvem, armazenamento local e servidores Korczak Vault.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading || guest}>Atualizar</button>
    </div>
    <div className="storage-status-list">
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon google"><StorageIcon kind="google" /></span><span><strong>Google Drive</strong><small>{selection?.provider === 'google-drive' ? 'Selecionado neste navegador' : 'Não conectado neste navegador'}</small></span></span>
        <StatusPill online={selection?.provider === 'google-drive'} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon vault-cloud"><StorageIcon kind="vault-cloud" /></span><span><strong>Korczak Vault</strong><small>{guest ? 'Entre na conta para usar o Korczak Vault' : loading ? 'Verificando servidores…' : refreshError ? 'Não foi possível verificar a conexão' : vaultOnline ? (nexusCloudSelected ? 'Selecionado · servidores disponíveis' : 'Servidores disponíveis') : (nexusCloudSelected ? 'Selecionado · nenhum servidor on-line' : 'Nenhum servidor on-line')}</small></span></span>
        <StatusPill online={!guest && !loading && !refreshError && vaultOnline && nexusCloudSelected} label={guest ? 'Indisponível' : loading ? 'Verificando' : refreshError ? 'Indisponível' : nexusCloudSelected ? undefined : 'Não selecionado'} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon microsoft"><StorageIcon kind="onedrive" /></span><span><strong>Microsoft OneDrive</strong><small>Integração não configurada</small></span></span>
        <StatusPill online={false} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon vault"><StorageIcon kind="vault" /></span><span><strong>Korczak Vault</strong><small>{vaultSubtitle}</small></span></span>
        <StatusPill online={!guest && !loading && !refreshError && vaultOnline} label={guest ? 'Indisponível' : loading ? 'Verificando' : refreshError ? 'Indisponível' : undefined} />
      </div>
      <div className="storage-status-row">
        <span className="storage-status-provider"><span className="storage-status-icon device"><StorageIcon kind="device" /></span><span><strong>Dispositivo</strong><small>{guest ? 'Entre na conta para consultar o armazenamento local' : localConfigured ? (selection?.folderName ? `Local · ${selection.folderName}` : 'Armazenamento local configurado') : 'Armazenamento local não configurado'}</small></span></span>
        <StatusPill online={!guest && localConfigured} />
      </div>
    </div>
    <p className="storage-status-footnote">Dispositivo é o armazenamento local da pessoa. Korczak Vault identifica os servidores vinculados exclusivamente por função: Servidor I, Servidor II e assim por diante.</p>
  </section>;
}
