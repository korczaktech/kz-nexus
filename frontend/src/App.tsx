import {FormEvent, ReactNode, useEffect, useState} from 'react';
import {api, clearToken, getToken, saveSession, type DocumentItem, type Event, type Folder, type Group, type Notification, type User, type Version} from './services/api';
import {Button, Icon, Modal, StatePanel} from './components/ui';
import {Editor, markdownToHtml} from './components/Editor';
import {ApiError} from './services/api';
import {chooseLocalFolder, getStorageSelection, saveStorageSelection, storageLabel, type StorageProvider} from './services/storage';
const nexusLogo = `${import.meta.env.BASE_URL}icons/favicon-nexus.svg?v=2`;

type View='home'|'documents'|'viewer'|'editor'|'create'|'history'|'versions'|'folders'|'favorites'|'recent'|'trash'|'search'|'advanced-search'|'profile'|'users'|'groups'|'permissions'|'folder-permissions'|'audit'|'admin'|'settings';

const nav:[View,string,string][]=[
  ['home','Início','home'],['documents','Meus Documentos','file'],['folders','Pastas','folder'],
  ['favorites','Favoritos','star'],['recent','Recentes','clock'],['trash','Lixeira','trash']
];
const secondary:[View,string,string][]=[
  ['search','Pesquisa','search'],['profile','Minha conta','user'],['settings','Configurações','settings']
];

function StoragePicker({onComplete,allowClose=false}:{onComplete:(provider:StorageProvider)=>void;allowClose?:boolean}){
  const[busy,setBusy]=useState<StorageProvider|null>(null);
  const[error,setError]=useState('');
  async function select(provider:StorageProvider){
    setError('');setBusy(provider);
    try{
      if(provider==='local'){
        const selection=await chooseLocalFolder();
        if(!selection) return;
        saveStorageSelection(selection);
        onComplete(provider);
        return;
      }
      const configured=provider==='google-drive'
        ?Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
        :Boolean(import.meta.env.VITE_ONEDRIVE_CLIENT_ID);
      if(!configured){
        setError(provider==='google-drive'
          ?'O Google Drive ainda precisa ser configurado pelo administrador do Korczak Nexus. A opção já está preparada para OAuth.'
          :'O OneDrive ainda precisa ser configurado pelo administrador do Korczak Nexus. A opção já está preparada para OAuth.');
        return;
      }
      const selection={provider,label:storageLabel(provider),connectedAt:new Date().toISOString()};
      saveStorageSelection(selection);
      onComplete(provider);
    }catch(e){
      if(e instanceof DOMException&&e.name==='AbortError')return;
      setError(e instanceof Error?e.message:'Não foi possível selecionar este armazenamento.');
    }finally{setBusy(null)}
  }
  return <div className="storage-gate" role="dialog" aria-modal="true" aria-labelledby="storage-gate-title">
    <div className="storage-gate-card">
      <div className="storage-gate-brand"><div className="brand-logo image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
      <div className="storage-gate-copy">
        <span className="storage-gate-eyebrow">PRIMEIRO ACESSO</span>
        <h1 id="storage-gate-title">Onde deseja armazenar seus documentos?</h1>
        <p>Escolha o armazenamento principal do Korczak Nexus. Você poderá alterar essa opção depois em Configurações.</p>
      </div>
      <div className="storage-options">
        <button className="storage-option" onClick={()=>select('local')} disabled={!!busy}>
          <span className="storage-option-icon"><Icon name="folder"/></span>
          <span><strong>Pasta deste dispositivo</strong><small>Escolha uma pasta no celular. Funciona no Android e em navegadores compatíveis com o seletor de pastas.</small></span>
          <Icon name="arrowRight" size={18}/>
        </button>
        <button className="storage-option" onClick={()=>select('google-drive')} disabled={!!busy}>
          <span className="storage-option-icon cloud"><Icon name="cloud"/></span>
          <span><strong>Google Drive</strong><small>Use seu Google Drive como armazenamento do Korczak Nexus.</small></span>
          <Icon name="arrowRight" size={18}/>
        </button>
        <button className="storage-option" onClick={()=>select('onedrive')} disabled={!!busy}>
          <span className="storage-option-icon cloud"><Icon name="cloud"/></span>
          <span><strong>OneDrive</strong><small>Use seu Microsoft OneDrive como armazenamento do Korczak Nexus.</small></span>
          <Icon name="arrowRight" size={18}/>
        </button>
      </div>
      {busy&&<p className="storage-gate-status">Preparando {storageLabel(busy)}…</p>}
      {error&&<div className="storage-gate-error">{error}</div>}
      {allowClose&&<button className="storage-gate-later" onClick={()=>onComplete(getStorageSelection()?.provider||'local')}>Continuar com a configuração atual</button>}
      <small className="storage-gate-foot">A escolha é salva neste navegador/dispositivo. O Korczak Nexus não acessa arquivos sem sua autorização.</small>
    </div>
  </div>
}

function Auth({done}:{done:(u:User)=>void}){
  const[register,setRegister]=useState(false),[recovery,setRecovery]=useState(false);
  const[form,setForm]=useState({name:'',email:'',password:''}),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function submit(e:FormEvent){e.preventDefault();setError('');setMessage('');
    try{
      if(recovery){const r=await api.recovery(form.email);setMessage(r.message);return}
      const s=register?await api.register(form):await api.login({email:form.email,password:form.password});
      saveSession(s);done(s.user);
    }catch(x){setError(x instanceof Error?x.message:'Não foi possível concluir.')}
  }
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-lockup"><div className="brand-logo image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
    <p className="eyebrow">KORCZAK TECHNOLOGIES</p><h1>{recovery?'Recupere seu acesso':register?'Crie sua conta':'Bem-vindo de volta'}</h1>
    <p className="auth-subtitle">{recovery?'Informe seu e-mail para receber as instruções.':'Gerencie seus documentos com organização, segurança e praticidade.'}</p>
    {error&&<div className="alert alert-error">{error}</div>}{message&&<div className="alert">{message}</div>}
    <form onSubmit={submit}>
      {!recovery&&register&&<label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label>}
      <label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label>
      {!recovery&&<label>Senha<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} minLength={12} required/></label>}
      <Button>{recovery?'Enviar recuperação':register?'Criar conta':'Entrar'}</Button>
    </form>
    <div className="auth-links"><button className="text-button" onClick={()=>setRecovery(!recovery)}>{recovery?'Voltar':'Recuperar acesso'}</button><button className="text-button" onClick={()=>{setRecovery(false);setRegister(!register)}}>{register?'Já tenho conta':'Criar conta'}</button></div>
  </section></main>
}

function Section({title,children,actions}:{title:string;children:ReactNode;actions?:ReactNode}){
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2></div>{actions}</div>{children}</section>
}

function DocumentTable({docs,onSelect,onAction,onPermanent}:{docs:DocumentItem[];onSelect:(d:DocumentItem)=>void;onAction:(d:DocumentItem)=>void;onPermanent?:(d:DocumentItem)=>void}){
  return docs.length?<div className="table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Modificado em</th><th>Status</th><th></th></tr></thead><tbody>
    {docs.map(d=><tr key={d.id}><td><button className="file-name" onClick={()=>onSelect(d)}><span className="file-type">{d.document_type.toUpperCase().slice(0,3)}</span><strong>{d.name}</strong></button></td><td>{d.document_type}</td><td>{new Date(d.updated_at).toLocaleString('pt-BR')}</td><td><span className={'status '+(d.status==='deleted'?'deleted':'active')}>{d.status==='deleted'?'Lixeira':'Ativo'}</span></td><td><button className="row-menu" aria-label={d.status==='deleted'?'Restaurar documento':d.favorite?'Remover favorito':'Adicionar favorito'} onClick={()=>onAction(d)}><Icon name={d.status==='deleted'?'arrowRight': 'star'} /></button>{d.status==='deleted'&&onPermanent&&<button className="row-menu danger" onClick={()=>onPermanent(d)} aria-label="Excluir definitivamente"><Icon name="close"/></button>}</td></tr>)}
  </tbody></table></div>:<StatePanel title="Nada por aqui" message="Nenhum documento encontrado."/>
}

function Home({user,docs,notes,onNew,onSelect,onAction,setView}:{user:User;docs:DocumentItem[];notes:Notification[];onNew:()=>void;onSelect:(d:DocumentItem)=>void;onAction:(d:DocumentItem)=>void;setView:(v:View)=>void}){
  
  return <>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">KORCZAK NEXUS</p><h1>Seus documentos,<br/><span>sempre organizados.</span></h1><p>Armazene, compartilhe e gerencie seus arquivos com segurança e praticidade. Tudo o que você precisa, em um só lugar.</p>
      <div className="hero-points"><span><Icon name="shield" size={15}/> Seguro</span><span><Icon name="clock" size={15}/> Rápido</span><span><Icon name="folder" size={15}/> Organizado</span><span><Icon name="cloud" size={15}/> Sempre disponível</span></div></div>
      <div className="hero-art" aria-hidden="true"><div className="mountain mountain-one"/><div className="mountain mountain-two"/><div className="beam"/></div>
    </section>
    <div className="quick-actions">
      <button onClick={onNew}><span className="quick-icon blue"><Icon name="plus"/></span><div><strong>Novo documento</strong><small>Crie um documento novo e escolha o modelo.</small></div></button>
      <button onClick={()=>setView('documents')}><span className="quick-icon blue"><Icon name="upload"/></span><div><strong>Adicionar arquivo</strong><small>Importe um arquivo para os seus documentos.</small></div></button>
      <button onClick={()=>setView('settings')}><span className="quick-icon blue"><Icon name="storage"/></span><div><strong>Armazenamento</strong><small>Gerencie o espaço e as opções da sua conta.</small></div></button>
      <button onClick={()=>setView('editor')}><span className="quick-icon blue"><Icon name="edit"/></span><div><strong>Abrir no editor</strong><small>Escolha um documento para continuar editando.</small></div></button>
    </div>
    <div className="home-columns">
      <Section title="Seus arquivos"><div className="file-tabs"><span className="active">Todos os documentos</span></div><DocumentTable docs={docs.slice(0,8)} onSelect={onSelect} onAction={onAction}/><button className="see-all" onClick={()=>setView('documents')}><span>Ver todos os documentos</span><Icon name="arrowRight" size={14}/></button></Section>
      <div className="home-side">
        <section className="side-card storage"><div className="card-title"><h2>Resumo</h2></div><div className="storage-copy"><strong>{docs.length} documentos</strong><span>na sua conta</span></div><div className="progress"><span style={{width:'100%'}}/></div><div className="storage-copy"><strong>{docs.filter(d=>d.favorite).length} favoritos</strong><span>{notes.filter(n=>!n.read).length} notificação(ões) nova(s)</span></div></section>
        <section className="side-card activity"><div className="card-title"><h2>Atividade recente</h2><button onClick={()=>setView('audit')}><span>Ver tudo</span><Icon name="arrowRight" size={14}/></button></div>{notes.slice(0,5).map((n,i)=><div className="activity-item" key={n.id}><span className={'activity-icon a'+i}><Icon name={i===0?'cloud':i===1?'upload':i===2?'file':i===3?'edit':'clock'} size={17}/></span><div><strong>{n.message}</strong><small>{n.read?'Lida':'Nova'}</small></div></div>)}{!notes.length&&<p className="muted">Nenhuma atividade recente.</p>}</section>
        <section className="side-card"><div className="card-title"><h2>Links rápidos</h2></div><button className="link-row" onClick={()=>setView('folders')}><Icon name="folder"/> <span>Pastas</span><Icon name="chevronRight" size={15}/></button><button className="link-row" onClick={()=>setView('favorites')}><Icon name="star"/> <span>Documentos favoritos</span><Icon name="chevronRight" size={15}/></button><button className="link-row" onClick={()=>setView('documents')}><Icon name="file"/> <span>Todos os documentos</span><Icon name="chevronRight" size={15}/></button><button className="link-row" onClick={()=>setView('trash')}><Icon name="trash"/> <span>Lixeira</span><Icon name="chevronRight" size={15}/></button></section>
      </div>
    </div>
    <div className="dashboard-foot"><span><Icon name="shield"/> Seus dados são protegidos por autenticação e controle de acesso.</span><span>Korczak Technologies&nbsp; • &nbsp;Korczak Nexus v1.0.0</span></div>
  </>
}

function App(){
  const[user,setUser]=useState<User|null>(null),[boot,setBoot]=useState(true),[view,setView]=useState<View>('home');
  const[storageSelection,setStorageSelection]=useState(()=>getStorageSelection()),[showStoragePicker,setShowStoragePicker]=useState(false);
  const[docs,setDocs]=useState<DocumentItem[]>([]),[selected,setSelected]=useState<DocumentItem|null>(null),[versions,setVersions]=useState<Version[]>([]),[history,setHistory]=useState<Event[]>([]);
  const[auditFilters,setAuditFilters]=useState({event_type:'',actor_id:'',resource:'',result:'',date_from:'',date_to:''}),[auditTotal,setAuditTotal]=useState(0),[folders,setFolders]=useState<Folder[]>([]),[deletedFolders,setDeletedFolders]=useState<Folder[]>([]),[tags,setTags]=useState<{id:string;owner_id:string;name:string}[]>([]),[moveModal,setMoveModal]=useState(false),[showFolderTrash,setShowFolderTrash]=useState(false),[users,setUsers]=useState<User[]>([]),[editingUser,setEditingUser]=useState<User|null>(null),[groups,setGroups]=useState<Group[]>([]),[events,setEvents]=useState<Event[]>([]),[notes,setNotes]=useState<Notification[]>([]);
  const[permissions,setPermissions]=useState<{role:string;actions:string[];user_ids:string[];group_ids:string[]}|null>(null),[folderPermissions,setFolderPermissions]=useState<{role:string;actions:string[];user_ids:string[];group_ids:string[]}|null>(null),[permissionFolder,setPermissionFolder]=useState<Folder|null>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[modal,setModal]=useState(false),[editingFolder,setEditingFolder]=useState<Folder|null>(null);
  const[theme,setTheme]=useState(localStorage.getItem('kz_theme')||'dark');
  const[advancedFilters,setAdvancedFilters]=useState({term:'',folder:'',tag:'',owner:'',status:'',from:'',to:'',sort:'updated_desc'});
  const[searchPage,setSearchPage]=useState(1),[searchTotal,setSearchTotal]=useState(0),searchPageSize=25;
  const[auditPage,setAuditPage]=useState(1),auditPageSize=50;

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('kz_theme',theme)},[theme]);
  useEffect(()=>{if(!getToken()){setBoot(false);return}api.me().then(setUser).catch(()=>clearToken()).finally(()=>setBoot(false))},[]);
  useEffect(()=>{if(user&&!getStorageSelection())setShowStoragePicker(true)},[user]);
  useEffect(()=>{if(user)load(view)},[user,view]);

  async function load(v:View=view){try{setError('');
    if(v==='home'||v==='documents')setDocs(await api.documents());
    if(v==='favorites')setDocs(await api.favorites()); if(v==='trash')setDocs(await api.trash()); if(v==='recent')setDocs(await api.recent());
    if(v==='folders'){setFolders(await api.folders());if(showFolderTrash)setDeletedFolders(await api.folderTrash())} if(v==='users'||v==='admin'||v==='permissions'||v==='folder-permissions')setUsers(await api.users()); if(v==='groups'||v==='permissions'||v==='folder-permissions')setGroups(await api.groups());
    if(v==='audit'){const result=await api.audit({...auditFilters,page:auditPage,page_size:auditPageSize});setEvents(result.items);setAuditTotal(result.total);if(user?.role==='admin'||user?.role==='manager')setUsers(await api.users())} if(v==='home')setNotes(await api.notifications());
    if(v==='search'&&query.trim())setDocs((await api.search(query)).items); if(v==='search'&&!query.trim())setDocs(await api.documents());
    if(v==='advanced-search'){setFolders(await api.folders());setTags(await api.tags());const result=await api.advancedSearch({...advancedFilters,page:searchPage,page_size:searchPageSize});setDocs(result.items);setSearchTotal(result.total)}
  }catch(x){setError(x instanceof Error?x.message:'Falha ao carregar dados.')}}
  async function openDoc(d:DocumentItem){try{const full=await api.document(d.id);setSelected(full);setVersions(await api.versions(d.id));setTags(await api.tags());await api.open(d.id)}catch(x){setError(x instanceof Error?x.message:'Não foi possível abrir o documento.')}setView('viewer')}
  async function showVersions(v:View){if(!selected)return;setVersions(await api.versions(selected.id));setView(v)}
  async function showHistory(){if(!selected)return;setHistory((await api.audit({document_id:selected.id})).items);setView('history')}
  async function saveEditor(data:{name:string;document_type:string;content:string;base_version_id:string|null}){
    if(!selected)return 'conflict' as const;
    try{
      const saved=await api.saveDocument(selected.id,data);
      setSelected(saved);
      setVersions(await api.versions(selected.id));
      return 'saved' as const;
    }catch(error){
      if(error instanceof ApiError&&error.status===409)return 'conflict' as const;
      throw error;
    }
  }
  async function handleEditorConflict(){
    if(!selected)throw new Error('Documento não selecionado');
    const fresh=await api.document(selected.id);
    setSelected(fresh);
    setVersions(await api.versions(selected.id));
    setError('Este documento foi alterado em outra sessão. O rascunho local permanece protegido até você escolher recarregar a versão atual.');
    return fresh;
  }
  async function createDocument(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api.createDocument({name:String(f.get('name')),document_type:String(f.get('type')),description:String(f.get('description')||''),folder_id:String(f.get('folder')||'')||null,content:String(f.get('content')||'')});setModal(false);setSelected(await api.document(d.id));setView('viewer')}catch(x){setError(x instanceof Error?x.message:'Não foi possível criar.')}}
  async function restoreVersion(v:Version){if(!selected)return;try{await api.restoreVersion(selected.id,v.id);setSelected(await api.document(selected.id));setVersions(await api.versions(selected.id));setView('viewer')}catch(x){setError(x instanceof Error?x.message:'Não foi possível restaurar a versão.')}}
  if(boot)return <StatePanel title="Iniciando" message="Preparando o Korczak Nexus…"/>; if(!user)return <Auth done={setUser}/>;

  const title=nav.concat(secondary).find(n=>n[0]===view)?.[1]||'Korczak Nexus';
  const action=async(d:DocumentItem)=>{try{if(d.status==='deleted')await api.restore(d.id);else await api.favorite(d.id,!d.favorite);await load(view)}catch(x){setError(x instanceof Error?x.message:'Operação não concluída.')}};

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="side-brand"><div className="brand-logo image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
      <nav className="side-nav">{nav.map(n=><button className={'nav-item '+(view===n[0]?'active':'')} onClick={()=>setView(n[0])} key={n[0]}><span className="sidebar-icon"><Icon name={n[2]}/></span><span className="nav-text">{n[1]}</span></button>)}</nav>
      {(user.role==='admin'||user.role==='manager')&&<><div className="nav-label">ADMINISTRAÇÃO</div><nav className="side-nav"><button className={'nav-item '+(view==='users'?'active':'')} onClick={()=>setView('users')}><span className="sidebar-icon"><Icon name="users"/></span><span className="nav-text">Usuários</span></button><button className={'nav-item '+(view==='groups'?'active':'')} onClick={()=>setView('groups')}><span className="sidebar-icon"><Icon name="gridMenu"/></span><span className="nav-text">Grupos</span></button></nav></>}
      <div className="nav-label">PESQUISA</div><nav className="side-nav"><button className={'nav-item '+(view==='search'?'active':'')} onClick={()=>setView('search')}><span className="sidebar-icon"><Icon name="search"/></span><span className="nav-text">Pesquisa rápida</span></button><button className={'nav-item '+(view==='advanced-search'?'active':'')} onClick={()=>setView('advanced-search')}><span className="sidebar-icon"><Icon name="scan"/></span><span className="nav-text">Pesquisa avançada</span></button></nav>
      <div className="sidebar-spacer"/><nav className="side-nav"><button className="nav-item" onClick={()=>setView('settings')}><span className="sidebar-icon"><Icon name="settings"/></span><span className="nav-text">Configurações</span></button><button className="nav-item" onClick={()=>setView('profile')}><span className="sidebar-icon"><Icon name="user"/></span><span className="nav-text">Minha conta</span></button></nav>
      <div className="sidebar-footer"><strong>KORCZAK TECHNOLOGIES</strong><span>Korczak Nexus</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="mobile-nexus-header">
          <div className="mobile-nexus-brand"><div className="brand-logo small image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
          <div className="mobile-nexus-actions">
            <button aria-label="Pesquisar" onClick={()=>setView('search')}><Icon name="search"/></button>
            <button aria-label="Notificações" onClick={()=>setView('home')} className="mobile-notify"><Icon name="cloud"/>{notes.some(n=>!n.read)&&<i/>}</button>
            <button aria-label="Minha conta" onClick={()=>setView('profile')}><span className="avatar">{user.name[0]}</span></button>
          </div>
        </div>
        <div className="mobile-brand"><div className="brand-logo small image-brand"><img src={nexusLogo} alt="" /></div><strong>KORCZAK <span>NEXUS</span></strong></div>
        <div className="top-search"><Icon name="search"/><input value={query} onChange={async e=>{const q=e.target.value;setQuery(q);setView('search');try{if(q.trim())setDocs((await api.search(q)).items);else setDocs(await api.documents())}catch(x){setError(x instanceof Error?x.message:'Não foi possível pesquisar.')}}} placeholder="Buscar documentos, pastas, projetos…"/><kbd>Ctrl + K</kbd></div>
        <div className="top-actions"><button aria-label="Notificações" onClick={()=>setView('home')} className="top-icon"><Icon name="cloud"/>{notes.some(n=>!n.read)&&<i/>}</button><button aria-label="Alternar tema" onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="top-icon"><Icon name="settings"/></button><div className="top-user" onClick={()=>setView('profile')}><span className="avatar">{user.name[0]}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Administrador':user.role==='manager'?'Gestor':'Usuário'}</small></div><span><Icon name="chevronDown" size={15}/></span></div></div>
      </header>
      <nav className="mobile-nexus-bottom" aria-label="Navegação principal">
        <button className={view==='home'?'active':''} onClick={()=>setView('home')}><Icon name="nexusHome"/><span>Início</span></button>
        <button className={['documents','folders','favorites','recent','trash'].includes(view)?'active':''} onClick={()=>setView('documents')}><Icon name="folderOpen"/><span>Arquivos</span></button>
        <button className={view==='create'?'active':''} onClick={()=>setModal(true)}><Icon name="plusCircle"/><span>Novo</span></button>
        <button className={view==='editor'?'active':''} onClick={()=>setView('editor')}><Icon name="editSquare"/><span>Editor</span></button>
        <button className={['settings','profile','users','groups','audit','advanced-search','search'].includes(view)?'active':''} onClick={()=>setView('settings')}><Icon name="gridMenu"/><span>Mais</span></button>
      </nav>
      <main className="content">
        {view!=='home'&&<div className="page-head"><div><p className="eyebrow">KORCZAK NEXUS</p><h1>{title}</h1></div>{(view==='documents'||view==='folders')&&<Button onClick={()=>{setEditingFolder(null);setModal(true)}}><Icon name="plus"/>{view==='folders'?'Nova pasta':'Novo documento'}</Button>}</div>}
        {error&&<div className="alert alert-error">{error}<button onClick={()=>load(view)}>Tentar novamente</button></div>}
        {view==='home'&&<Home user={user} docs={docs} notes={notes} onNew={()=>setModal(true)} onSelect={openDoc} onAction={action} setView={setView}/>}
        {(view==='documents'||view==='favorites'||view==='recent'||view==='search')&&<Section title={title} actions={view==='search'?<Button variant="secondary" onClick={()=>setView('advanced-search')}>Pesquisa avançada</Button>:undefined}><DocumentTable docs={docs} onSelect={openDoc} onAction={action}/></Section>}
        {view==='trash'&&<Section title="Lixeira"><p className="muted">Documentos removidos ficam aqui até serem restaurados ou excluídos definitivamente.</p><DocumentTable docs={docs} onSelect={openDoc} onAction={action} onPermanent={async d=>{if(!window.confirm('Excluir definitivamente este documento? Esta ação não pode ser desfeita.'))return;try{await api.permanentDelete(d.id);await load('trash')}catch(x){setError(x instanceof Error?x.message:'Não foi possível excluir definitivamente.')}}}/></Section>}
        {view==='advanced-search'&&<Section title="Pesquisa avançada">
  <form className="search-panel" onSubmit={e=>{e.preventDefault();setSearchPage(1);load('advanced-search')}}>
    <div className="form-grid">
      <label>Nome, descrição ou conteúdo<input value={advancedFilters.term} onChange={e=>setAdvancedFilters({...advancedFilters,term:e.target.value})} placeholder="Digite um termo"/></label>
      <label>Pasta<select value={advancedFilters.folder} onChange={e=>setAdvancedFilters({...advancedFilters,folder:e.target.value})}><option value="">Todas</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label>Etiqueta<select value={advancedFilters.tag} onChange={e=>setAdvancedFilters({...advancedFilters,tag:e.target.value})}><option value="">Todas</option>{tags.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}</select></label>
      <label>Proprietário<select value={advancedFilters.owner} onChange={e=>setAdvancedFilters({...advancedFilters,owner:e.target.value})}><option value="">Eu</option>{user&&<option value={user.id}>{user.name}</option>}</select></label>
      <label>Estado<select value={advancedFilters.status} onChange={e=>setAdvancedFilters({...advancedFilters,status:e.target.value})}><option value="">Ativos</option><option value="active">Ativos</option><option value="deleted">Lixeira</option></select></label>
      <label>De<input type="date" value={advancedFilters.from} onChange={e=>setAdvancedFilters({...advancedFilters,from:e.target.value})}/></label>
      <label>Até<input type="date" value={advancedFilters.to} onChange={e=>setAdvancedFilters({...advancedFilters,to:e.target.value})}/></label>
      <label>Ordenar<select value={advancedFilters.sort} onChange={e=>setAdvancedFilters({...advancedFilters,sort:e.target.value})}><option value="updated_desc">Atualização mais recente</option><option value="updated_asc">Atualização mais antiga</option><option value="name_asc">Nome A–Z</option><option value="name_desc">Nome Z–A</option></select></label>
    </div>
    <Button type="submit">Pesquisar</Button>
  </form>
  <p className="muted">{searchTotal} ocorrência(s) encontrada(s).</p>
  <DocumentTable docs={docs} onSelect={openDoc} onAction={action}/>
  {searchTotal>searchPageSize&&<div className="pagination"><Button variant="secondary" disabled={searchPage<=1} onClick={()=>{setSearchPage(p=>p-1);setTimeout(()=>load('advanced-search'),0)}}>Anterior</Button><span>Página {searchPage} de {Math.ceil(searchTotal/searchPageSize)}</span><Button variant="secondary" disabled={searchPage>=Math.ceil(searchTotal/searchPageSize)} onClick={()=>{setSearchPage(p=>p+1);setTimeout(()=>load('advanced-search'),0)}}>Próxima</Button></div>}
</Section>}
        {view==='viewer'&&selected&&<Section title={selected.name} actions={<Button variant="secondary" onClick={()=>setView('editor')}><Icon name="edit"/> <span>Editar documento</span></Button>}><div className="document-toolbar">
<Button variant="secondary" onClick={()=>showVersions('versions')}><Icon name="versions"/> <span>Versões</span></Button>
<Button variant="secondary" onClick={showHistory}><Icon name="clock"/> <span>Histórico</span></Button>
<Button variant="secondary" onClick={async()=>{setFolders(await api.folders());setMoveModal(true)}}><Icon name="folderOpen"/> <span>Mover para pasta</span></Button>
<Button variant="secondary" onClick={async()=>{try{await api.favorite(selected.id,!selected.favorite);setSelected(await api.document(selected.id))}catch(x){setError(x instanceof Error?x.message:'Não foi possível atualizar o favorito.')}}}><Icon name="star"/> <span>{selected.favorite?'Remover favorito':'Adicionar favorito'}</span></Button>
<Button variant="secondary" onClick={async()=>{setPermissions(await api.permissions(selected.id));setView('permissions')}}><Icon name="shield"/> <span>Permissões</span></Button>
<Button variant="danger" onClick={async()=>{if(!window.confirm('Tem certeza que quer excluir? A pasta será movida para lixeira.'))return;try{await api.deleteDocument(selected.id);setView('trash');await load('trash')}catch(x){setError(x instanceof Error?x.message:'Não foi possível mover o documento para a lixeira.')}}}><Icon name="trash"/> <span>Excluir</span></Button>
</div><div className="tag-panel"><strong>Etiquetas</strong><div className="tag-list">{(selected.tag_names||[]).map(t=><button key={t} className="tag-chip" onClick={async()=>{await api.removeTag(selected.id,t);setSelected(await api.document(selected.id))}}><span>{t}</span><Icon name="close" size={12}/></button>)}{!(selected.tag_names||[]).length&&<span className="muted">Nenhuma etiqueta aplicada.</span>}</div><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const name=String(f.get('tag')||'').trim();if(!name)return;try{if(!tags.some(t=>t.name===name))await api.createTag(name);await api.applyTag(selected.id,name);setTags(await api.tags());setSelected(await api.document(selected.id));e.currentTarget.reset()}catch(x){setError(x instanceof Error?x.message:'Não foi possível aplicar a etiqueta.')}}} className="inline-form"><input name="tag" list="document-tags" placeholder="Adicionar etiqueta"/><datalist id="document-tags">{tags.map(t=><option key={t.id} value={t.name}/>)}</datalist><Button type="submit" variant="secondary">Aplicar</Button></form></div><article className="document-view"><div className="document-meta"><span className="file-type large">{selected.document_type.toUpperCase()}</span><div><strong>{selected.name}</strong><small>Atualizado em {new Date(selected.updated_at).toLocaleString('pt-BR')}</small></div></div><div className="document-content" dangerouslySetInnerHTML={{__html:markdownToHtml(selected.content||'Este documento não possui conteúdo textual.')}} /></article></Section>}
        {view==='editor'&&selected&&<Editor document={selected} versions={versions} onSave={saveEditor} onClose={()=>setView('viewer')} onConflict={handleEditorConflict}/>} 
        {view==='history'&&selected&&<Section title="Histórico de atividades">{history.length?<div className="event-list">{history.map(e=><article key={e.id}><strong>{e.type}</strong><span>{new Date(e.created_at).toLocaleString('pt-BR')}</span><code>{JSON.stringify(e.payload)}</code></article>)}</div>:<StatePanel title="Sem histórico" message="Ainda não existem atividades registradas para este documento."/>}</Section>}
        {view==='versions'&&selected&&<Section title="Versões">{versions.length?<div className="version-list">{versions.map(v=><article key={v.id}><strong>Versão {v.version_number}</strong><span>{new Date(v.created_at).toLocaleString('pt-BR')}</span><p>{v.content||'Sem conteúdo.'}</p><Button variant="secondary" onClick={()=>restoreVersion(v)}>Restaurar esta versão</Button></article>)}</div>:<StatePanel title="Sem versões" message="Este documento ainda não possui versões."/>}</Section>}
        {view==='folders'&&<Section title={showFolderTrash?'Lixeira de pastas':'Pastas'} actions={<Button variant="secondary" onClick={async()=>{setShowFolderTrash(!showFolderTrash);if(!showFolderTrash)setDeletedFolders(await api.folderTrash())}}>{showFolderTrash?'Voltar às pastas':'Lixeira de pastas'}</Button>}><div className="card-grid">{(showFolderTrash?deletedFolders:folders).map(f=><article className="mini-card" key={f.id}><span className="folder-icon"><Icon name="folder" size={22}/></span><strong>{f.name}</strong><small>{f.parent_id?'Subpasta':'Pasta raiz'}</small><div>{showFolderTrash?<Button variant="secondary" onClick={async()=>{await api.restoreFolder(f.id);setDeletedFolders(await api.folderTrash())}}>Restaurar</Button>:<><Button variant="secondary" onClick={()=>{setEditingFolder(f);setModal(true)}}>Renomear</Button>{(user.role==='admin'||user.role==='manager'||f.owner_id===user.id)&&<Button variant="secondary" onClick={async()=>{try{setPermissionFolder(f);setFolderPermissions(await api.folderPermissions(f.id));setView('folder-permissions')}catch(x){setError(x instanceof Error?x.message:'Não foi possível carregar as permissões.')}}}>Permissões</Button>}<Button variant="danger" onClick={async()=>{await api.deleteFolder(f.id);load('folders')}}>Excluir</Button></>}</div></article>)}</div>{!(showFolderTrash?deletedFolders:folders).length&&<StatePanel title="Nenhuma pasta" message={showFolderTrash?'A lixeira de pastas está vazia.':'Crie uma pasta para começar a organizar seus documentos.'}/>}</Section>}
        {view==='profile'&&<Section title="Minha conta"><form className="profile-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{setUser(await api.updateMe({name:String(f.get('name')),phone:String(f.get('phone'))}))}catch(x){setError(x instanceof Error?x.message:'Não foi possível atualizar o perfil.')}}}><label>Nome<input name="name" defaultValue={user.name}/></label><label>E-mail<input value={user.email} disabled/></label><label>Telefone<input name="phone" defaultValue={user.phone||''}/></label><Button>Salvar perfil</Button></form></Section>}
        {view==='users'&&<Section title="Usuários">{(user.role==='admin'||user.role==='manager')?<><Button onClick={()=>{setEditingUser(null);setModal(true)}}>Criar usuário</Button><div className="user-list">{users.map(u=><article key={u.id}><strong>{u.name}</strong><span>{u.email} · {u.role} · {u.status||'active'}</span><div><Button variant="secondary" onClick={()=>{setEditingUser(u);setModal(true)}}>Editar</Button><Button variant="secondary" onClick={async()=>{await api.adminUpdateUser(u.id,{status:u.status==='active'?'inactive':'active'});setUsers(await api.users())}}>{u.status==='active'?'Desativar':'Ativar'}</Button></div></article>)}</div></>:<StatePanel title="Acesso restrito" message="Somente gestores e administradores podem gerenciar usuários."/>}</Section>}
        {view==='groups'&&<Section title="Grupos">{(user.role==='admin'||user.role==='manager')&&<Button onClick={async()=>{const name=window.prompt('Nome do grupo');if(name){try{await api.createGroup(name);setGroups(await api.groups())}catch(x){setError(x instanceof Error?x.message:'Não foi possível criar o grupo.')}}}}>Criar grupo</Button>}<div className="card-grid">{groups.map(g=><article className="mini-card" key={g.id}><strong>{g.name}</strong><small>{g.member_ids.length} membro(s)</small>{(user.role==='admin'||user.role==='manager')&&<><select onChange={async e=>{if(e.target.value){await api.addMember(g.id,e.target.value);setGroups(await api.groups())}}} defaultValue=""><option value="">Adicionar usuário...</option>{users.filter(u=>!g.member_ids.includes(u.id)).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><div>{g.member_ids.map(id=>{const m=users.find(x=>x.id===id);return <button key={id} onClick={async()=>{await api.removeMember(g.id,id);setGroups(await api.groups())}}><span>{m?.name||id}</span><Icon name="close" size={12}/></button>})}</div></>}</article>)}</div></Section>}
        {view==='folder-permissions'&&permissionFolder&&folderPermissions&&<Section title={'Permissões da pasta: '+permissionFolder.name}><p>Papel: <strong>{folderPermissions.role}</strong></p><div className="permission-grid">{['read','write','delete','share'].map(a=><label key={a}><input type="checkbox" checked={folderPermissions.actions.includes(a)} onChange={e=>setFolderPermissions({...folderPermissions,actions:e.target.checked?[...folderPermissions.actions,a]:folderPermissions.actions.filter(x=>x!==a)})}/> {a}</label>)}</div><label>Usuários autorizados<select multiple value={folderPermissions.user_ids} onChange={e=>setFolderPermissions({...folderPermissions,user_ids:Array.from(e.target.selectedOptions,o=>o.value)})}>{users.filter(u=>u.id!==permissionFolder.owner_id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Grupos autorizados<select multiple value={folderPermissions.group_ids} onChange={e=>setFolderPermissions({...folderPermissions,group_ids:Array.from(e.target.selectedOptions,o=>o.value)})}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><Button onClick={async()=>{await api.setFolderPermissions(permissionFolder.id,folderPermissions);setFolderPermissions(await api.folderPermissions(permissionFolder.id))}}>Salvar política</Button></Section>}

{view==='permissions'&&selected&&permissions&&<Section title={'Permissões: '+selected.name}><p>Papel: <strong>{permissions.role}</strong></p><div className="permission-grid">{['read','write','delete','share'].map(a=><label key={a}><input type="checkbox" checked={permissions.actions.includes(a)} onChange={e=>setPermissions({...permissions,actions:e.target.checked?[...permissions.actions,a]:permissions.actions.filter(x=>x!==a)})}/> {a}</label>)}</div><label>Usuários autorizados<select multiple value={permissions.user_ids} onChange={e=>setPermissions({...permissions,user_ids:Array.from(e.target.selectedOptions,o=>o.value)})}>{users.filter(u=>u.id!==selected.owner_id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Grupos autorizados<select multiple value={permissions.group_ids} onChange={e=>setPermissions({...permissions,group_ids:Array.from(e.target.selectedOptions,o=>o.value)})}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{(user.role==='admin'||user.role==='manager'||selected.owner_id===user.id)&&<Button onClick={async()=>{await api.setPermissions(selected.id,permissions);setPermissions(await api.permissions(selected.id))}}>Salvar política</Button>}</Section>}
        {view==='audit'&&<Section title="Auditoria">
  <form className="search-panel" onSubmit={async e=>{e.preventDefault();try{const result=await api.audit({...auditFilters,page:1,page_size:auditPageSize});setAuditPage(1);setEvents(result.items);setAuditTotal(result.total)}catch(x){setError(x instanceof Error?x.message:'Não foi possível consultar a auditoria.')}}}>
    <div className="form-grid">
      <label>Tipo de evento<input value={auditFilters.event_type} onChange={e=>setAuditFilters({...auditFilters,event_type:e.target.value})} placeholder="ex.: document.updated"/></label>
      {(user.role==='admin'||user.role==='manager')&&<label>Ator<select value={auditFilters.actor_id} onChange={e=>setAuditFilters({...auditFilters,actor_id:e.target.value})}><option value="">Todos</option>{users.map(u=><option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label>}
      <label>Recurso<select value={auditFilters.resource} onChange={e=>setAuditFilters({...auditFilters,resource:e.target.value})}><option value="">Todos</option><option value="document">Documento</option><option value="folder">Pasta</option><option value="user">Usuário</option><option value="group">Grupo</option><option value="system">Sistema</option></select></label>
      <label>Resultado<select value={auditFilters.result} onChange={e=>setAuditFilters({...auditFilters,result:e.target.value})}><option value="">Todos</option><option value="success">Sucesso</option><option value="failure">Falha</option></select></label>
      <label>De<input type="date" value={auditFilters.date_from} onChange={e=>setAuditFilters({...auditFilters,date_from:e.target.value})}/></label>
      <label>Até<input type="date" value={auditFilters.date_to} onChange={e=>setAuditFilters({...auditFilters,date_to:e.target.value})}/></label>
    </div>
    <Button type="submit">Filtrar auditoria</Button>
  </form>
  <p className="muted">{auditTotal} evento(s) encontrado(s).</p>
  <div className="event-list">{events.map(e=><article key={e.id}><strong>{e.type}</strong><span>{new Date(e.created_at).toLocaleString('pt-BR')} · {e.result||'success'} · {e.integrity_valid===false?'Integridade inválida':'Integridade válida'}</span><small>Ator: {e.actor_id||e.user_id||'sistema'} · Recurso: {e.resource||'system'} {e.resource_id||''}</small><code>{JSON.stringify(e.payload)}</code></article>)}</div>
  {auditTotal>auditPageSize&&<div className="pagination"><Button variant="secondary" disabled={auditPage<=1} onClick={async()=>{const p=auditPage-1;const r=await api.audit({...auditFilters,page:p,page_size:auditPageSize});setAuditPage(p);setEvents(r.items)}}>Anterior</Button><span>Página {auditPage} de {Math.ceil(auditTotal/auditPageSize)}</span><Button variant="secondary" disabled={auditPage>=Math.ceil(auditTotal/auditPageSize)} onClick={async()=>{const p=auditPage+1;const r=await api.audit({...auditFilters,page:p,page_size:auditPageSize});setAuditPage(p);setEvents(r.items)}}>Próxima</Button></div>}
</Section>}
        {view==='settings'&&<Section title="Configurações"><div className="settings-list"><article><strong>Tema</strong><button onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'Usar tema claro':'Usar tema escuro'}</button></article><article><strong>Armazenamento</strong><div className="settings-storage"><span>{storageSelection?storageLabel(storageSelection.provider):'Não configurado'}{storageSelection?.folderName&&<small>{storageSelection.folderName}</small>}</span><button onClick={()=>setShowStoragePicker(true)}>Alterar armazenamento</button></div></article><article><strong>Sessão</strong><span>{user.email}</span></article><article><strong>API</strong><span>Configurada por VITE_API_BASE_URL</span></article><article><strong>Sair</strong><button onClick={async()=>{try{if(getToken())await api.logout()}catch{}finally{clearToken();setUser(null)}}}>Encerrar sessão</button></article></div></Section>}
      </main>
    </div>
    {showStoragePicker&&<StoragePicker allowClose={Boolean(storageSelection)} onComplete={(provider)=>{const next=getStorageSelection();setStorageSelection(next||{provider,label:storageLabel(provider),connectedAt:new Date().toISOString()});setShowStoragePicker(false)}}/>}
    {moveModal&&selected&&<Modal title="Mover documento" onClose={()=>setMoveModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api.updateDocument(selected.id,{folder_id:String(f.get('folder')||'')||null});setSelected(await api.document(d.id));setMoveModal(false)}catch(x){setError(x instanceof Error?x.message:'Não foi possível mover o documento.')}}}><label>Pasta de destino<select name="folder" defaultValue={selected.folder_id||''}><option value="">Sem pasta</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><Button type="submit"><Icon name="folderOpen"/> <span>Mover</span></Button></form></Modal>}
    {modal&&view==='users'&&<Modal title={editingUser?'Editar usuário':'Novo usuário'} onClose={()=>setModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(editingUser){await api.adminUpdateUser(editingUser.id,{name:String(f.get('name')),phone:String(f.get('phone')),role:String(f.get('role'))});}else{await api.adminCreateUser({name:String(f.get('name')),email:String(f.get('email')),password:String(f.get('password')),phone:String(f.get('phone')||''),role:String(f.get('role'))});}setUsers(await api.users());setModal(false)}}><label>Nome<input name="name" defaultValue={editingUser?.name||''} required/></label><label>E-mail<input name="email" defaultValue={editingUser?.email||''} type="email" required disabled={!!editingUser}/></label>{!editingUser&&<label>Senha<input name="password" type="password" minLength={12} required/></label>}<label>Telefone<input name="phone" defaultValue={editingUser?.phone||''}/></label><label>Perfil<select name="role" defaultValue={editingUser?.role||'user'}><option value="user">Usuário</option><option value="manager">Gestor</option>{user.role==='admin'&&<option value="admin">Administrador</option>}</select></label><Button type="submit">Salvar</Button></form></Modal>}
    {modal&&view!=='users'&&<Modal title={view==='folders'?(editingFolder?'Renomear pasta':'Nova pasta'):'Novo documento'}  onClose={()=>setModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(view==='folders'){if(editingFolder)await api.updateFolder(editingFolder.id,{name:String(f.get('name'))});else await api.createFolder(String(f.get('name')),String(f.get('parent')||'')||null);setModal(false);load('folders')}else await createDocument(e)}}>{view==='folders'?<><label>Nome<input name="name" defaultValue={editingFolder?.name||''} required/></label>{!editingFolder&&<label>Pasta pai<select name="parent"><option value="">Raiz</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</>:<><label>Nome<input name="name" required/></label><label>Descrição<input name="description" maxLength={2000}/></label><label>Tipo<input name="type" defaultValue="txt" required/></label><label>Pasta<select name="folder"><option value="">Sem pasta</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Conteúdo<textarea name="content" rows={8}/></label></>}<Button type="submit">Salvar</Button></form></Modal>}
  </div>
}
export default App;
