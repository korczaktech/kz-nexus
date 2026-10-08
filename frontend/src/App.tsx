import {FormEvent, ReactNode, useEffect, useRef, useState} from 'react';
import {api, clearToken, getToken, saveSession, type DocumentItem, type Event, type Folder, type Group, type Notification, type User, type Version} from './services/api';
import {Button, Icon, Modal, StatePanel} from './components/ui';
import {Editor, markdownToHtml} from './components/Editor';
import {ApiError} from './services/api';
import {chooseLocalFolder, getStorageSelection, saveStorageSelection, storageLabel, connectCloudStorage, type StorageProvider} from './services/storage';

import {listIOSFiles, getIOSFile, deleteIOSFile, shareIOSFile} from './services/iosFiles';
import {isIOS} from './iosPwa';
import {finishCloudOAuth} from './services/cloudStorage';
const nexusLogo = `${import.meta.env.BASE_URL}icons/favicon-nexus.svg?v=2`;
const NEXUS_RELEASE_FALLBACK = '0.0.0.331';
const NEXUS_API_VERSION = '0.3.0';
const NEXUS_SITE = 'https://korczaktech.github.io/kz-nexus';
function versionParts(value:string){return value.replace(/^v/i,'').split('.').map(part=>Number.parseInt(part,10)||0)}
function compareVersions(a:string,b:string){const aa=versionParts(a),bb=versionParts(b);for(let i=0;i<3;i++){if((aa[i]||0)!==(bb[i]||0))return (aa[i]||0)>(bb[i]||0)?1:-1}return 0}

type View='home'|'documents'|'viewer'|'editor'|'create'|'history'|'versions'|'folders'|'favorites'|'recent'|'trash'|'search'|'advanced-search'|'profile'|'about'|'privacy'|'terms'|'credits'|'users'|'groups'|'permissions'|'folder-permissions'|'audit'|'admin'|'settings';

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
await connectCloudStorage(provider);
      return;
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
      </div>
      {busy&&<p className="storage-gate-status">Preparando {storageLabel(busy)}…</p>}
      {error&&<div className="storage-gate-error">{error}</div>}
      {allowClose&&<button className="storage-gate-later" onClick={()=>onComplete(getStorageSelection()?.provider||'local')}>Continuar com a configuração atual</button>}
      <small className="storage-gate-foot">A escolha é salva neste navegador/dispositivo. O Korczak Nexus não acessa arquivos sem sua autorização.</small>
    </div>
  </div>
}

function PasswordStrength({password}:{password:string}){const score=[password.length>=12,password.length>=16,/[a-z]/.test(password),/[A-Z]/.test(password),/[0-9]/.test(password),/[^A-Za-z0-9]/.test(password)].filter(Boolean).length;const level=score<=2?'Fraca':score<=4?'Média':'Forte';return <div className="password-strength"><div className="password-strength-bar"><span style={{width:Math.max(8,Math.round(score/6*100))+'%'}}/></div><small>Senha <strong>{level}</strong></small></div>}

function Auth({done}:{done:(u:User)=>void}){
  const[register,setRegister]=useState(false),[recovery,setRecovery]=useState(false);
  const[form,setForm]=useState({name:'',email:'',password:'',confirmPassword:''}),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function submit(e:FormEvent){e.preventDefault();setError('');setMessage('');
    try{
      if(recovery){const r=await api.recovery(form.email);setMessage(r.message);return}
      if(register&&form.password!==form.confirmPassword){setError('As senhas não coincidem.');return}
      const s=register?await api.register({name:form.name,email:form.email,password:form.password}):await api.login({email:form.email,password:form.password});
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
      {!recovery&&<label>Senha<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} minLength={register?12:undefined} required/>{register&&<PasswordStrength password={form.password}/>}</label>}{!recovery&&register&&<label>Confirmar senha<input type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} minLength={12} required/></label>}
      <Button>{recovery?'Enviar recuperação':register?'Criar conta':'Entrar'}</Button>
    </form>
    <div className="auth-links"><button className="text-button" onClick={()=>setRecovery(!recovery)}>{recovery?'Voltar':'Recuperar acesso'}</button><button className="text-button" onClick={()=>{setRecovery(false);setRegister(!register)}}>{register?'Já tenho conta':'Criar conta'}</button></div>
  </section></main>
}

function ProfileMenu({user,onClose,onFeedback,onNavigate}:{user:User;onClose:()=>void;onFeedback:()=>void;onNavigate:(view:View)=>void}){
  async function logout(){try{if(getToken())await api.logout()}catch{}finally{clearToken();onClose();window.location.reload()}}
  return <div className="profile-menu" role="menu">
    <div className="profile-menu-user"><span className="avatar">{user.name[0]}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
    <div className="profile-menu-divider"/>
    <button role="menuitem" onClick={()=>{onClose();onFeedback()}}><Icon name="edit"/><span>Relatar problema</span></button>
    <button role="menuitem" onClick={()=>{onClose();onNavigate('about')}}><Icon name="file"/><span>Sobre o Nexus</span></button>
    <button role="menuitem" onClick={()=>{onClose();onNavigate('settings')}}><Icon name="settings"/><span>Configurações</span></button>
    <button role="menuitem" onClick={()=>{onClose();onNavigate('profile')}}><Icon name="user"/><span>Meu perfil</span></button>
    <div className="profile-menu-divider"/>
    <button role="menuitem" className="profile-menu-danger" onClick={logout}><Icon name="sign"/><span>Sair da conta</span></button>
  </div>
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
  const[voiceListening,setVoiceListening]=useState(false),[voiceText,setVoiceText]=useState(''),[voiceLevel,setVoiceLevel]=useState(0);
  const streamRef=useRef<MediaStream|null>(null),audioCtxRef=useRef<AudioContext|null>(null),rafRef=useRef<number|null>(null),recognitionRef=useRef<any>(null),barsRef=useRef<HTMLSpanElement[]>([]);
  function stopVoice(){
    if(recognitionRef.current){try{recognitionRef.current.stop()}catch{} recognitionRef.current=null}
    if(rafRef.current!==null){cancelAnimationFrame(rafRef.current);rafRef.current=null}
    streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;
    if(audioCtxRef.current){try{audioCtxRef.current.close()}catch{} audioCtxRef.current=null}
    setVoiceListening(false);setVoiceLevel(0);
    barsRef.current.forEach((el,i)=>{if(el)el.style.transform='scaleY(.12)'});
  }
  useEffect(()=>()=>stopVoice(),[]);
  async function toggleVoice(){
    if(voiceListening){stopVoice();return}
    if(!navigator.mediaDevices?.getUserMedia){setVoiceText('Seu navegador não permite acesso ao microfone.');return}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      streamRef.current=stream;setVoiceListening(true);setVoiceText('Ouvindo…');
      const AudioContextCtor=window.AudioContext||(window as any).webkitAudioContext;
      if(AudioContextCtor){
        const ctx=new AudioContextCtor();audioCtxRef.current=ctx;
        const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();
        analyser.fftSize=128;analyser.smoothingTimeConstant=.78;source.connect(analyser);
        const data=new Uint8Array(analyser.frequencyBinCount);
        const animate=()=>{
          analyser.getByteFrequencyData(data);
          let sum=0;for(let i=0;i<data.length;i++)sum+=data[i];
          const level=Math.min(1,sum/data.length/92);setVoiceLevel(level);
          barsRef.current.forEach((el,i)=>{
            if(!el)return;
            const index=Math.min(data.length-1,Math.floor((i/data.length)*data.length*1.7));
            const value=Math.max(.12,Math.min(1,(data[index]||0)/150*(1.15+Math.sin(i*.9)*.18)));
            el.style.transform='scaleY('+value+')';
          });
          rafRef.current=requestAnimationFrame(animate);
        };
        if(ctx.state==='suspended')await ctx.resume();
        rafRef.current=requestAnimationFrame(animate);
      }
      const SpeechRecognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
      if(SpeechRecognition){
        const recognition=new SpeechRecognition();recognitionRef.current=recognition;
        recognition.lang='pt-BR';recognition.interimResults=true;recognition.continuous=true;recognition.maxAlternatives=1;
        recognition.onresult=(event:any)=>{
          const results=Array.from(event.results) as any[];
          const text=results.map((r:any)=>r?.[0]?.transcript||'').join('').trim();
          if(text)setVoiceText(text);
        };
        recognition.onerror=(event:any)=>{
          if(event?.error==='not-allowed'||event?.error==='service-not-allowed')setVoiceText('Microfone bloqueado pelo navegador.');
          else if(event?.error!=='aborted')setVoiceText('Microfone ativo — não consegui transcrever a fala.');
        };
        recognition.onend=()=>{
          if(streamRef.current&&voiceListening){try{recognition.start()}catch{}}
        };
        try{recognition.start()}catch{}
      }else{
        setVoiceText('Microfone ativo. Reconhecimento de voz não disponível neste navegador.');
      }
    }catch(error:any){
      stopVoice();setVoiceText(error?.name==='NotAllowedError'?'Permita o acesso ao microfone para usar a voz.':'Não foi possível iniciar o microfone.');
    }
  }
  return <>
    <section className="hero">
      <div className="hero-copy"><p className="eyebrow">KORCZAK NEXUS</p><h1>Seus documentos,<br/><span>sempre organizados.</span></h1><p>Armazene, compartilhe e gerencie seus arquivos com segurança e praticidade. Tudo o que você precisa, em um só lugar.</p>
      <div className="hero-points"><span><Icon name="shield" size={15}/> Seguro</span><span><Icon name="clock" size={15}/> Rápido</span><span><Icon name="folder" size={15}/> Organizado</span><span><Icon name="cloud" size={15}/> Sempre disponível</span></div></div>
      <div className="hero-art" aria-hidden="true"><div className="mountain mountain-one"/><div className="mountain mountain-two"/><div className="beam"/></div>
    </section>
    <nav className="quick-actions" aria-label="Ações rápidas">
      <button onClick={onNew}><span className="quick-icon blue"><Icon name="plus"/></span><div><strong>Novo documento</strong><small>Crie um documento novo e escolha o modelo.</small></div></button>
      <button onClick={()=>setView('documents')}><span className="quick-icon blue"><Icon name="upload"/></span><div><strong>Adicionar arquivo</strong><small>Importe um arquivo para os seus documentos.</small></div></button>
      <button onClick={()=>setView('settings')}><span className="quick-icon blue"><Icon name="storage"/></span><div><strong>Armazenamento</strong><small>Gerencie o espaço e as opções da sua conta.</small></div></button>
      <button onClick={()=>setView('editor')}><span className="quick-icon blue"><Icon name="edit"/></span><div><strong>Abrir no editor</strong><small>Escolha um documento para continuar editando.</small></div></button>
    </nav>
    <div className="home-columns">
      <section className="home-files"><div className="home-files-card">
        <div className="card-title"><h2>Seus arquivos</h2><button onClick={()=>setView('documents')}><span>Ver todos</span><Icon name="arrowRight" size={14}/></button></div>
        <div className="file-tabs"><span className="active">Todos os documentos</span></div>
        <DocumentTable docs={docs.slice(0,8)} onSelect={onSelect} onAction={onAction}/>
      </div></section>
      <div className="home-side">
        <section className="side-card pulse-card">
          <div className="card-title"><div><p className="eyebrow">PULSO DO ESPAÇO</p><h2>O que está acontecendo</h2></div><button onClick={()=>setView('audit')}><span>Ver tudo</span><Icon name="arrowRight" size={14}/></button></div>
          <div className="pulse-wave" aria-hidden="true">{Array.from({length:24},(_,i)=><span key={i} ref={el=>{if(el)barsRef.current[i]=el}}/>)}</div>
          <div className="pulse-status-row"><span className={'pulse-dot '+(voiceListening?'live':'')}/><span>{voiceListening?'Microfone captando em tempo real':'Espaço sincronizado'}</span><strong>{docs.length}</strong></div>
          <div className="pulse-stat"><strong>{docs.filter(d=>d.favorite).length}</strong><span>documentos favoritos</span></div>
          <div className="pulse-activity">{notes.slice(0,5).map((n,i)=><div className="activity-item" key={n.id}><span className={'activity-icon a'+i}><Icon name={i===0?'cloud':i===1?'upload':i===2?'file':i===3?'edit':'clock'} size={17}/></span><div><strong>{n.message}</strong><small>{n.read?'Lida':'Nova'}</small></div></div>)}{!notes.length&&<p className="muted">Nenhuma atividade recente.</p>}</div>
        </section>
        <section className="side-card voice-card">
          <div className="card-title"><div><p className="eyebrow">CONTROLE POR VOZ</p><h2>Fale com o Nexus</h2></div><span className="voice-badge">BETA</span></div>
          <div className="voice-main">
            <button className={'voice-mic '+(voiceListening?'listening':'')} onClick={toggleVoice} aria-label={voiceListening?'Parar microfone':'Ativar microfone'}><Icon name="mic" size={28}/><span>{voiceListening?'Parar':'Microfone'}</span></button>
            <div className="voice-copy"><strong>{voiceListening?'Voz conectada':'Pronto para ouvir'}</strong><p>{voiceText||'Ative o microfone e fale naturalmente. A frequência acompanha sua voz.'}</p><div className="voice-level"><i style={{transform:'scaleX('+Math.max(.08,voiceLevel)+')'}}/></div></div>
          </div>
          <div className="morok-unavailable"><span className="morok-mark">M</span><div><strong>Morok AI ainda não está disponível</strong><small>O microfone e a captura de voz já estão funcionando; a inteligência conversacional será integrada posteriormente.</small></div></div>
        </section>
        <section className="side-card">
          <div className="card-title"><h2>Links rápidos</h2></div>
          <button className="link-row" onClick={()=>setView('folders')}><Icon name="folder"/> <span>Pastas</span><Icon name="chevronRight" size={15}/></button>
          <button className="link-row" onClick={()=>setView('favorites')}><Icon name="star"/> <span>Documentos favoritos</span><Icon name="chevronRight" size={15}/></button>
          <button className="link-row" onClick={()=>setView('documents')}><Icon name="file"/> <span>Todos os documentos</span><Icon name="chevronRight" size={15}/></button>
          <button className="link-row" onClick={()=>setView('trash')}><Icon name="trash"/> <span>Lixeira</span><Icon name="chevronRight" size={15}/></button>
        </section>
      </div>
    </div>
    <div className="dashboard-foot"><span><Icon name="shield"/> Seus dados são protegidos por autenticação e controle de acesso.</span><span>Korczak Technologies&nbsp; • &nbsp;Korczak Nexus v{NEXUS_RELEASE_FALLBACK}</span></div>
  </>
}
function App(){
  const[user,setUser]=useState<User|null>(null),[boot,setBoot]=useState(true),[view,setView]=useState<View>('home'),[profileMenuOpen,setProfileMenuOpen]=useState(false);
  const[storageSelection,setStorageSelection]=useState(()=>getStorageSelection()),[showStoragePicker,setShowStoragePicker]=useState(false);
  const[docs,setDocs]=useState<DocumentItem[]>([]),[selected,setSelected]=useState<DocumentItem|null>(null),[versions,setVersions]=useState<Version[]>([]),[history,setHistory]=useState<Event[]>([]);
  const[auditFilters,setAuditFilters]=useState({event_type:'',actor_id:'',resource:'',result:'',date_from:'',date_to:''}),[auditTotal,setAuditTotal]=useState(0),[folders,setFolders]=useState<Folder[]>([]),[deletedFolders,setDeletedFolders]=useState<Folder[]>([]),[tags,setTags]=useState<{id:string;owner_id:string;name:string}[]>([]),[moveModal,setMoveModal]=useState(false),[showFolderTrash,setShowFolderTrash]=useState(false),[users,setUsers]=useState<User[]>([]),[editingUser,setEditingUser]=useState<User|null>(null),[groups,setGroups]=useState<Group[]>([]),[events,setEvents]=useState<Event[]>([]),[notes,setNotes]=useState<Notification[]>([]);
  const[permissions,setPermissions]=useState<{role:string;actions:string[];user_ids:string[];group_ids:string[]}|null>(null),[folderPermissions,setFolderPermissions]=useState<{role:string;actions:string[];user_ids:string[];group_ids:string[]}|null>(null),[permissionFolder,setPermissionFolder]=useState<Folder|null>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[modal,setModal]=useState(false),[editingFolder,setEditingFolder]=useState<Folder|null>(null);
  const[theme,setTheme]=useState(localStorage.getItem('kz_theme')||'dark'),[feedbackOpen,setFeedbackOpen]=useState(false),[feedbackBusy,setFeedbackBusy]=useState(false),[feedbackSent,setFeedbackSent]=useState(false);
  const[advancedFilters,setAdvancedFilters]=useState({term:'',folder:'',tag:'',owner:'',status:'',from:'',to:'',sort:'updated_desc'});
  const[searchPage,setSearchPage]=useState(1),[searchTotal,setSearchTotal]=useState(0),searchPageSize=25;
  const[auditPage,setAuditPage]=useState(1),auditPageSize=50;
  const[webRelease,setWebRelease]=useState<{tag_name?:string;html_url?:string}|null>(null),[webReleaseBusy,setWebReleaseBusy]=useState(false),[webReleaseError,setWebReleaseError]=useState('');
  const[iosOffline,setIosOffline]=useState(isIOS&&!navigator.onLine),[iosLocalFiles,setIosLocalFiles]=useState<Array<{id:string;name:string;type:string;size:number;lastModified:number}>>([]);
  async function checkWebRelease(){setWebReleaseBusy(true);setWebReleaseError('');try{const r=await fetch('https://api.github.com/repos/korczaktech/kz-nexus/releases/latest',{headers:{Accept:'application/vnd.github+json'}});if(!r.ok)throw new Error('Não foi possível consultar a versão publicada.');setWebRelease(await r.json())}catch(e){setWebReleaseError(e instanceof Error?e.message:'Não foi possível verificar atualizações.')}finally{setWebReleaseBusy(false)}}
  const releaseVersion=(webRelease?.tag_name||NEXUS_RELEASE_FALLBACK).replace(/^v/i,'');
  const[hubIntegration,setHubIntegration]=useState<'checking'|'online'|'offline'>('checking');
  async function checkHubIntegration(){try{await api.health();setHubIntegration('online')}catch{setHubIntegration('offline')}}

  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('kz_theme',theme)},[theme]);
  useEffect(()=>{checkWebRelease();checkHubIntegration();const online=()=>{checkHubIntegration()};const offline=()=>setHubIntegration('offline');window.addEventListener('online',online);window.addEventListener('offline',offline);return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline)}},[]);
  useEffect(()=>{if(!getToken()){setBoot(false);return}api.me().then(setUser).catch(()=>clearToken()).finally(()=>setBoot(false))},[]);
  useEffect(()=>{finishCloudOAuth().then(provider=>{if(provider){const selection={provider,label:storageLabel(provider),connectedAt:new Date().toISOString()};saveStorageSelection(selection);setStorageSelection(selection);}}).catch(e=>setError(e instanceof Error?e.message:'Não foi possível conectar o armazenamento.'))},[]);
  useEffect(()=>{if(user&&!getStorageSelection())setShowStoragePicker(true)},[user]);
  useEffect(()=>{if(user)load(view)},[user,view]);
  useEffect(()=>{
    if(!isIOS)return;
    const onRuntime=(event:globalThis.Event)=>setIosOffline(!((event as CustomEvent<{online:boolean}>).detail?.online));
    const loadLocal=()=>listIOSFiles().then(setIosLocalFiles).catch(()=>setIosLocalFiles([]));
    loadLocal();
    const onFilesChanged=()=>listIOSFiles().then(rows=>{setIosLocalFiles(rows);if(view==='home'||view==='documents')load(view)}).catch(()=>setIosLocalFiles([]));
    window.addEventListener('nexusIOSRuntime',onRuntime as EventListener);
    window.addEventListener('nexusIOSFilesChanged',onFilesChanged as EventListener);
    window.addEventListener('online',()=>setIosOffline(false),{passive:true});
    window.addEventListener('offline',()=>setIosOffline(true),{passive:true});
    return()=>{window.removeEventListener('nexusIOSRuntime',onRuntime as EventListener);window.removeEventListener('nexusIOSFilesChanged',onFilesChanged as EventListener)};
  },[]);

  async function load(v:View=view){try{setError('');
    if(v==='home'||v==='documents'){
      const remote=await api.documents();
      if(isIOS){
        const local=iosLocalFiles.map(f=>({id:'ios:'+f.id,owner_id:user?.id||'',name:f.name,document_type:(f.type.split('/').pop()||'file').slice(0,12),folder_id:null,current_version_id:null,status:'local',favorite:false,created_at:new Date(f.lastModified||Date.now()).toISOString(),updated_at:new Date(f.lastModified||Date.now()).toISOString(),content:null}));
        setDocs([...local,...remote]);
      }else setDocs(remote);
    }
    if(v==='favorites')setDocs(await api.favorites()); if(v==='trash')setDocs(await api.trash()); if(v==='recent')setDocs(await api.recent());
    if(v==='folders'){setFolders(await api.folders());if(showFolderTrash)setDeletedFolders(await api.folderTrash())} if(v==='users'||v==='admin'||v==='permissions'||v==='folder-permissions')setUsers(await api.users()); if(v==='groups'||v==='permissions'||v==='folder-permissions')setGroups(await api.groups());
    if(v==='audit'){const result=await api.audit({...auditFilters,page:auditPage,page_size:auditPageSize});setEvents(result.items);setAuditTotal(result.total);if(user?.role==='admin'||user?.role==='manager')setUsers(await api.users())} if(v==='home')setNotes(await api.notifications());
    if(v==='search'&&query.trim())setDocs((await api.search(query)).items); if(v==='search'&&!query.trim())setDocs(await api.documents());
    if(v==='advanced-search'){setFolders(await api.folders());setTags(await api.tags());const result=await api.advancedSearch({...advancedFilters,page:searchPage,page_size:searchPageSize});setDocs(result.items);setSearchTotal(result.total)}
  }catch(x){setError(x instanceof Error?x.message:'Falha ao carregar dados.')}}
  async function openDoc(d:DocumentItem){
    if(d.id.startsWith('ios:')){
      try{
        const file=await getIOSFile(d.id.slice(4));
        if(!file){setError('O arquivo local não está mais disponível no dispositivo.');return;}
        let content='Arquivo local importado pelo Arquivos do iOS.';
        if(file.type.startsWith('text/')||/\.(txt|md|csv|json|rtf|html|xml)$/i.test(file.name)) content=await file.text();
        setSelected({...d,content});
        setVersions([]);
        setView('viewer');
      }catch(x){setError(x instanceof Error?x.message:'Não foi possível abrir o arquivo local.')}
      return;
    }
    try{const full=await api.document(d.id);setSelected(full);setVersions(await api.versions(d.id));setTags(await api.tags());await api.open(d.id)}catch(x){setError(x instanceof Error?x.message:'Não foi possível abrir o documento.')}setView('viewer')}
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
  if(boot)return <StatePanel title="Iniciando" message="Preparando o Korczak Nexus… Isso pode levar cerca de 30 a 60 segundos. Em alguns casos, pode levar até 2 minutos."/>; if(!user)return <Auth done={setUser}/>;

  const title=nav.concat(secondary).find(n=>n[0]===view)?.[1]||'Korczak Nexus';
  const action=async(d:DocumentItem)=>{
    if(d.id.startsWith('ios:')){
      try{await deleteIOSFile(d.id.slice(4));const local=await listIOSFiles();setIosLocalFiles(local);await load(view)}
      catch(x){setError(x instanceof Error?x.message:'Não foi possível remover o arquivo local.')}
      return;
    }
    try{if(d.status==='deleted')await api.restore(d.id);else await api.favorite(d.id,!d.favorite);await load(view)}catch(x){setError(x instanceof Error?x.message:'Operação não concluída.')}};

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="side-brand"><div className="brand-logo image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
      <nav className="side-nav">{nav.map(n=><button className={'nav-item '+(view===n[0]?'active':'')} onClick={()=>setView(n[0])} key={n[0]}><span className="sidebar-icon"><Icon name={n[2]}/></span><span className="nav-text">{n[1]}</span></button>)}</nav>
      {(user.role==='admin'||user.role==='manager')&&<><div className="nav-label">ADMINISTRAÇÃO</div><nav className="side-nav"><button className={'nav-item '+(view==='users'?'active':'')} onClick={()=>setView('users')}><span className="sidebar-icon"><Icon name="users"/></span><span className="nav-text">Usuários</span></button><button className={'nav-item '+(view==='groups'?'active':'')} onClick={()=>setView('groups')}><span className="sidebar-icon"><Icon name="gridMenu"/></span><span className="nav-text">Grupos</span></button></nav></>}
      <div className="nav-label">PESQUISA</div><nav className="side-nav"><button className={'nav-item '+(view==='search'?'active':'')} onClick={()=>setView('search')}><span className="sidebar-icon"><Icon name="search"/></span><span className="nav-text">Pesquisa rápida</span></button><button className={'nav-item '+(view==='advanced-search'?'active':'')} onClick={()=>setView('advanced-search')}><span className="sidebar-icon"><Icon name="scan"/></span><span className="nav-text">Pesquisa avançada</span></button></nav>
      <div className="sidebar-spacer"/><nav className="side-nav"><button className="nav-item" onClick={()=>setFeedbackOpen(true)}><span className="sidebar-icon"><Icon name="edit"/></span><span className="nav-text">Dar um feedback</span></button><button className="nav-item" onClick={()=>setView('settings')}><span className="sidebar-icon"><Icon name="settings"/></span><span className="nav-text">Configurações</span></button><button className="nav-item" onClick={()=>setView('profile')}><span className="sidebar-icon"><Icon name="user"/></span><span className="nav-text">Minha conta</span></button></nav>
      <div className="sidebar-footer"><strong>KORCZAK TECHNOLOGIES</strong><span>Korczak Nexus</span></div>
    </aside>
    <div className="main-shell">
      {isIOS&&iosOffline&&<div className="ios-offline-banner" role="status"><Icon name="cloud"/> Você está offline. Arquivos locais continuam disponíveis; alterações feitas ao servidor serão enviadas quando a conexão voltar.</div>}
      <header className="topbar">
        <div className="mobile-nexus-header">
          <div className="mobile-nexus-brand"><div className="brand-logo small image-brand"><img src={nexusLogo} alt="" /></div><div><strong>KORCZAK</strong><span>NEXUS</span></div></div>
          <div className="mobile-nexus-actions">
            <button aria-label="Pesquisar" onClick={()=>setView('search')}><Icon name="search"/></button>
            <button aria-label="Notificações" onClick={()=>setView('home')} className="mobile-notify"><Icon name="cloud"/>{notes.some(n=>!n.read)&&<i/>}</button>
            <div className="mobile-profile-menu-wrap"><button aria-label="Abrir menu da conta" aria-expanded={profileMenuOpen} onClick={()=>setProfileMenuOpen(v=>!v)}><span className="avatar">{user.name[0]}</span></button>{profileMenuOpen&&<ProfileMenu user={user} onClose={()=>setProfileMenuOpen(false)} onFeedback={()=>setFeedbackOpen(true)} onNavigate={v=>setView(v)}/>}</div>
          </div>
        </div>
        <div className="mobile-brand"><div className="brand-logo small image-brand"><img src={nexusLogo} alt="" /></div><strong>KORCZAK <span>NEXUS</span></strong></div>
        <div className="top-search"><Icon name="search"/><input value={query} onChange={async e=>{const q=e.target.value;setQuery(q);setView('search');try{if(q.trim())setDocs((await api.search(q)).items);else setDocs(await api.documents())}catch(x){setError(x instanceof Error?x.message:'Não foi possível pesquisar.')}}} placeholder="Buscar documentos, pastas, projetos…"/><kbd>Ctrl + K</kbd></div>
        <div className="top-actions"><button aria-label="Notificações" onClick={()=>setView('home')} className="top-icon"><Icon name="cloud"/>{notes.some(n=>!n.read)&&<i/>}</button><button aria-label="Alternar tema" onClick={()=>setTheme(theme==='dark'?'light':'dark')} className="top-icon"><Icon name="settings"/></button><div className="profile-menu-wrap"><button className="top-user" aria-label="Abrir menu da conta" aria-expanded={profileMenuOpen} onClick={()=>setProfileMenuOpen(v=>!v)}><span className="avatar">{user.name[0]}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Administrador':user.role==='manager'?'Gestor':'Usuário'}</small></div><span><Icon name="chevronDown" size={15}/></span></button>{profileMenuOpen&&<ProfileMenu user={user} onClose={()=>setProfileMenuOpen(false)} onFeedback={()=>setFeedbackOpen(true)} onNavigate={v=>setView(v)}/>}</div></div>
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
<Button variant="secondary" onClick={async()=>{try{const file=selected.id.startsWith('ios:')?await getIOSFile(selected.id.slice(4)):new File([selected.content||''],selected.name,{type:selected.document_type==='txt'?'text/plain':'text/plain'});if(!file||!(await shareIOSFile(file)))setError('O compartilhamento não está disponível neste dispositivo.')}catch(x){setError(x instanceof Error?x.message:'Não foi possível compartilhar o documento.')}}}><Icon name="share"/> <span>Compartilhar</span></Button>
<Button variant="secondary" onClick={async()=>{setPermissions(await api.permissions(selected.id));setView('permissions')}}><Icon name="shield"/> <span>Permissões</span></Button>
<Button variant="danger" onClick={async()=>{if(!window.confirm('Tem certeza que quer excluir? A pasta será movida para lixeira.'))return;try{await api.deleteDocument(selected.id);setView('trash');await load('trash')}catch(x){setError(x instanceof Error?x.message:'Não foi possível mover o documento para a lixeira.')}}}><Icon name="trash"/> <span>Excluir</span></Button>
</div><div className="tag-panel"><strong>Etiquetas</strong><div className="tag-list">{(selected.tag_names||[]).map(t=><button key={t} className="tag-chip" onClick={async()=>{await api.removeTag(selected.id,t);setSelected(await api.document(selected.id))}}><span>{t}</span><Icon name="close" size={12}/></button>)}{!(selected.tag_names||[]).length&&<span className="muted">Nenhuma etiqueta aplicada.</span>}</div><form onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const name=String(f.get('tag')||'').trim();if(!name)return;try{if(!tags.some(t=>t.name===name))await api.createTag(name);await api.applyTag(selected.id,name);setTags(await api.tags());setSelected(await api.document(selected.id));e.currentTarget.reset()}catch(x){setError(x instanceof Error?x.message:'Não foi possível aplicar a etiqueta.')}}} className="inline-form"><input name="tag" list="document-tags" placeholder="Adicionar etiqueta"/><datalist id="document-tags">{tags.map(t=><option key={t.id} value={t.name}/>)}</datalist><Button type="submit" variant="secondary">Aplicar</Button></form></div><article className="document-view"><div className="document-meta"><span className="file-type large">{selected.document_type.toUpperCase()}</span><div><strong>{selected.name}</strong><small>Atualizado em {new Date(selected.updated_at).toLocaleString('pt-BR')}</small></div></div><div className="document-content" dangerouslySetInnerHTML={{__html:markdownToHtml(selected.content||'Este documento não possui conteúdo textual.')}} /></article></Section>}
        {view==='editor'&&selected&&<Editor document={selected} versions={versions} onSave={saveEditor} onClose={()=>setView('viewer')} onConflict={handleEditorConflict}/>} 
        {view==='history'&&selected&&<Section title="Histórico de atividades">{history.length?<div className="event-list">{history.map(e=><article key={e.id}><strong>{e.type}</strong><span>{new Date(e.created_at).toLocaleString('pt-BR')}</span><code>{JSON.stringify(e.payload)}</code></article>)}</div>:<StatePanel title="Sem histórico" message="Ainda não existem atividades registradas para este documento."/>}</Section>}
        {view==='versions'&&selected&&<Section title="Versões">{versions.length?<div className="version-list">{versions.map(v=><article key={v.id}><strong>Versão {v.version_number}</strong><span>{new Date(v.created_at).toLocaleString('pt-BR')}</span><p>{v.content||'Sem conteúdo.'}</p><Button variant="secondary" onClick={()=>restoreVersion(v)}>Restaurar esta versão</Button></article>)}</div>:<StatePanel title="Sem versões" message="Este documento ainda não possui versões."/>}</Section>}
        {view==='folders'&&<Section title={showFolderTrash?'Lixeira de pastas':'Pastas'} actions={<Button variant="secondary" onClick={async()=>{setShowFolderTrash(!showFolderTrash);if(!showFolderTrash)setDeletedFolders(await api.folderTrash())}}>{showFolderTrash?'Voltar às pastas':'Lixeira de pastas'}</Button>}><div className="card-grid">{(showFolderTrash?deletedFolders:folders).map(f=><article className="mini-card" key={f.id}><span className="folder-icon"><Icon name="folder" size={22}/></span><strong>{f.name}</strong><small>{f.parent_id?'Subpasta':'Pasta raiz'}</small><div>{showFolderTrash?<Button variant="secondary" onClick={async()=>{await api.restoreFolder(f.id);setDeletedFolders(await api.folderTrash())}}>Restaurar</Button>:<><Button variant="secondary" onClick={()=>{setEditingFolder(f);setModal(true)}}>Renomear</Button>{(user.role==='admin'||user.role==='manager'||f.owner_id===user.id)&&<Button variant="secondary" onClick={async()=>{try{setPermissionFolder(f);setFolderPermissions(await api.folderPermissions(f.id));setView('folder-permissions')}catch(x){setError(x instanceof Error?x.message:'Não foi possível carregar as permissões.')}}}>Permissões</Button>}<Button variant="danger" onClick={async()=>{await api.deleteFolder(f.id);load('folders')}}>Excluir</Button></>}</div></article>)}</div>{!(showFolderTrash?deletedFolders:folders).length&&<StatePanel title="Nenhuma pasta" message={showFolderTrash?'A lixeira de pastas está vazia.':'Crie uma pasta para começar a organizar seus documentos.'}/>}</Section>}
        {view==='about'&&<Section title="Sobre o Nexus"><div className="about-nexus"><div className="about-brand"><div className="brand-logo image-brand"><img src={nexusLogo} alt="Korczak Nexus"/></div><div><strong>KORCZAK NEXUS</strong><span>Korczak Technologies</span></div></div><p>Informações oficiais do produto, versão, distribuição, segurança, integração e documentação jurídica do Korczak Nexus.</p><div className="about-info-list"><article><strong>Nome</strong><span>Korczak Nexus</span></article><article><strong>Versão</strong><span>{releaseVersion}</span></article><article><strong>Desenvolvedor</strong><span>Korczak Technologies</span></article><article><strong>Licença</strong><span>Fechada</span></article><article><strong>Direitos autorais</strong><span>Korczak HUB 2026</span></article><button onClick={()=>setView('privacy')}>Política de privacidade <Icon name="arrowRight"/></button><button onClick={()=>setView('terms')}>Termos de uso <Icon name="arrowRight"/></button><button onClick={()=>setView('credits')}>Créditos <Icon name="arrowRight"/></button><article><strong>Banco de Dados</strong><span>MongoDB</span></article><article><strong>Segurança e privacidade</strong><span>KZSecurity</span></article><article><strong>Distribuição e Utilidades</strong><span>Korczak Technologies</span></article><article><strong>Versão da API</strong><span>NexusAPI v{NEXUS_API_VERSION}</span></article><article><strong>Korczak HUB Integration</strong><span className={'integration-status '+hubIntegration}><i/>{hubIntegration==='checking'?'Verificando…':hubIntegration==='online'?'Online':'Offline'}</span></article><article><strong>Atualizador</strong><span>Korczak HUB Releases</span></article><article className="about-link-row"><strong>Site</strong><a href={NEXUS_SITE} target="_blank" rel="noreferrer">korczaktech.github.io/kz-nexus <Icon name="arrowRight" size={14}/></a></article></div></div></Section>}
        {view==='profile'&&<Section title="Minha conta"><form className="profile-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{setUser(await api.updateMe({name:String(f.get('name')),phone:String(f.get('phone'))}))}catch(x){setError(x instanceof Error?x.message:'Não foi possível atualizar o perfil.')}}}><label>Nome<input name="name" defaultValue={user.name}/></label><label>E-mail<input value={user.email} disabled/></label><label>Telefone<input name="phone" defaultValue={user.phone||''}/></label><Button>Salvar perfil</Button></form><div className="profile-actions"><Button variant="danger" type="button" onClick={async()=>{try{if(getToken())await api.logout()}catch{}finally{clearToken();setUser(null);setView('home')}}}>Sair da conta</Button></div></Section>}
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
        {view==='privacy'&&<Section title="Política de privacidade"><div className="legal-page">
<h3>Política de Privacidade — Korczak Nexus</h3><p><strong>Última atualização: 7 de outubro de 2026.</strong></p>
<p>Esta Política explica como o Korczak Nexus, produto do Korczak HUB desenvolvido e distribuído pela Korczak Technologies, trata dados pessoais e informações necessárias ao funcionamento do aplicativo, do site e de suas integrações. O documento é elaborado considerando, conforme aplicável, a Constituição Federal, a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD), o Marco Civil da Internet (Lei nº 12.965/2014), o Código de Defesa do Consumidor (Lei nº 8.078/1990), o Estatuto da Criança e do Adolescente e a legislação brasileira aplicável, inclusive normas específicas de proteção de crianças e adolescentes em ambientes digitais.</p>
<h4>1. Quem somos</h4><p>O Korczak Nexus é desenvolvido e distribuído pela <strong>Korczak Technologies</strong>. Para fins de proteção de dados, a identificação jurídica completa, endereço e canal formal de encarregado devem ser mantidos atualizados pela empresa nos canais oficiais. O próprio aplicativo disponibiliza o recurso de feedback para comunicação operacional e solicitações relacionadas ao serviço.</p>
<h4>2. Dados que podem ser tratados</h4><ul><li><strong>Cadastro e autenticação:</strong> nome, e-mail, telefone quando informado, identificadores internos da conta, estado da conta, verificações e datas de criação/atualização.</li><li><strong>Conteúdo:</strong> documentos, títulos, descrições, versões, pastas, favoritos, tags, histórico, lixeira e demais informações que você voluntariamente inserir ou criar.</li><li><strong>Colaboração e administração:</strong> grupos, permissões, compartilhamentos e registros necessários para controle de acesso.</li><li><strong>Segurança e auditoria:</strong> eventos de acesso e operação, resultados de operações, identificadores técnicos e informações necessárias para prevenção de fraude, abuso e incidentes.</li><li><strong>Feedback:</strong> categoria, mensagem e avaliação quando enviada voluntariamente.</li><li><strong>Armazenamento local:</strong> preferências, seleção de armazenamento, estado de sessão e dados mantidos pelo navegador/dispositivo para permitir o funcionamento do aplicativo.</li><li><strong>Integrações externas:</strong> quando você conectar o Google Drive, podem ser tratados tokens e identificadores de autorização necessários à integração. O acesso é limitado ao escopo autorizado pelo provedor e pela funcionalidade utilizada.</li><li><strong>Dados técnicos:</strong> informações de conectividade e diagnóstico podem ser processadas para disponibilidade, segurança e correção de falhas.</li></ul>
<h4>3. Finalidades</h4><p>Os dados são utilizados para criar e manter contas; autenticar usuários; armazenar, recuperar, editar, versionar e excluir documentos; administrar pastas, favoritos, tags, grupos e permissões; registrar auditoria e segurança; responder a feedback; manter a disponibilidade, integridade e segurança; realizar atualizações; cumprir obrigações legais; exercer direitos em processos administrativos ou judiciais; prevenir fraude, abuso e uso indevido; e executar integrações que o usuário tenha solicitado.</p>
<h4>4. Bases legais</h4><p>Conforme o caso concreto, o tratamento pode se apoiar em execução de contrato ou procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, proteção da segurança e prevenção à fraude, legítimo interesse com avaliação de necessidade e balanceamento, ou consentimento quando exigido. O consentimento, quando utilizado como base, poderá ser revogado pelos meios disponibilizados, sem afetar a legalidade dos tratamentos realizados anteriormente.</p>
<h4>5. Conteúdo dos documentos</h4><p>O conteúdo inserido pelo usuário é tratado para fornecer as funcionalidades solicitadas. O Korczak Nexus não adquire propriedade sobre seus documentos por causa do uso do serviço. O usuário continua responsável por possuir os direitos necessários sobre o conteúdo que inserir, compartilhar ou importar.</p>
<h4>6. Compartilhamento</h4><p>Não comercializamos dados pessoais. O compartilhamento ocorre apenas quando necessário para operar o serviço, cumprir obrigação legal, exercer direitos, proteger usuários e sistemas, executar uma integração solicitada pelo usuário ou atender ordem de autoridade competente. Prestadores que atuem como operadores devem receber somente os dados necessários às finalidades contratadas.</p>
<h4>7. Google Drive e serviços de terceiros</h4><p>Ao conectar o Google Drive, você autoriza a integração com o Google nos termos da autorização apresentada pelo próprio Google. O uso do Google Drive também está sujeito às políticas e termos do Google. O Nexus não controla as práticas de privacidade de serviços externos. Você pode desconectar a integração quando disponível no aplicativo.</p>
<h4>8. Armazenamento e retenção</h4><p>Os dados são mantidos enquanto necessários para fornecer o serviço, cumprir obrigações legais/regulatórias, preservar registros exigidos, prevenir fraude e exercer ou defender direitos. Documentos enviados à lixeira podem permanecer no sistema até sua exclusão definitiva conforme as funcionalidades disponíveis. Prazos específicos podem variar de acordo com a natureza do dado e da obrigação aplicável.</p>
<h4>9. Segurança</h4><p>O Nexus adota medidas técnicas e administrativas compatíveis com os riscos, incluindo autenticação, controle de acesso, proteção de credenciais, limitação de requisições, cabeçalhos de segurança, registro de auditoria e práticas de proteção de dados. Nenhum sistema conectado à internet pode garantir segurança absoluta. A KZSecurity representa a camada de segurança e privacidade do ecossistema, sem eliminar a necessidade de boas práticas do usuário.</p>
<h4>10. Incidentes de segurança</h4><p>Quando ocorrer incidente que possa acarretar risco ou dano relevante, serão adotadas as providências exigidas pela legislação e pelas orientações da autoridade competente, inclusive comunicações aos titulares e à ANPD quando aplicáveis.</p>
<h4>11. Direitos do titular</h4><p>Nos termos da LGPD e conforme aplicável, o titular pode solicitar confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade, portabilidade quando regulamentada e cabível, informação sobre compartilhamentos, revogação de consentimento, oposição nos casos previstos em lei e revisão de decisões automatizadas quando aplicável. Solicitações podem exigir validação de identidade para proteger a conta.</p>
<h4>12. Crianças e adolescentes</h4><p>O Nexus não deve ser utilizado para contornar regras de idade ou para coletar dados de crianças e adolescentes de forma incompatível com a legislação. Quando houver acesso provável por crianças ou adolescentes, serão observadas as salvaguardas legalmente exigidas, incluindo proteção prioritária, privacidade, segurança, melhor interesse e medidas proporcionais de proteção, conforme a legislação vigente.</p>
<h4>13. Cookies, armazenamento local e tecnologias semelhantes</h4><p>O aplicativo pode utilizar armazenamento local e de sessão para manter autenticação, preferências, seleção de armazenamento, estados temporários de integração e funcionamento do serviço. Essas tecnologias não devem ser confundidas com uma autorização irrestrita para rastreamento. Recursos de terceiros podem possuir suas próprias tecnologias e políticas.</p>
<h4>14. Transferências internacionais</h4><p>Alguns provedores de infraestrutura ou integrações podem processar dados fora do Brasil. Quando houver transferência internacional de dados pessoais, ela será realizada conforme as hipóteses e garantias admitidas pela LGPD e regulamentação aplicável.</p>
<h4>15. Auditoria e registros</h4><p>Registros de auditoria podem ser mantidos para segurança, rastreabilidade, gestão de permissões, investigação de incidentes, prevenção de abuso e cumprimento de obrigações. O acesso a esses registros é limitado conforme a função e a necessidade.</p>
<h4>16. Alterações</h4><p>Esta política pode ser atualizada para refletir mudanças no produto, na legislação ou nos processos de tratamento. Alterações relevantes serão apresentadas de forma adequada. A versão vigente será a publicada no Nexus.</p>
<h4>17. Contato e reclamações</h4><p>Para dúvidas, solicitações de privacidade ou reclamações, utilize os canais oficiais da Korczak Technologies e o recurso “Relatar problema” do Nexus. O titular também pode exercer seus direitos perante a ANPD, quando cabível.</p>
<h4>18. Legislação aplicável</h4><p>Esta política é interpretada conforme a legislação brasileira aplicável, sem prejuízo dos direitos obrigatórios assegurados ao titular.</p>
</div></Section>}
{view==='terms'&&<Section title="Termos de uso"><div className="legal-page">
<h3>Termos de Uso — Korczak Nexus</h3><p><strong>Última atualização: 8 de outubro de 2026.</strong></p>
<p>Estes Termos regulam o acesso e uso do Korczak Nexus, aplicativo do Korczak HUB desenvolvido e distribuído pela Korczak Technologies. Ao criar uma conta, acessar ou utilizar o Nexus, você declara que leu e compreendeu estes Termos, sem prejuízo dos direitos que não podem ser afastados por contrato.</p>
<h4>1. Objeto</h4><p>O Nexus oferece recursos para criação, armazenamento, organização, edição, versionamento, pesquisa, gerenciamento, compartilhamento e exclusão de documentos, além de pastas, favoritos, tags, grupos, permissões, auditoria, notificações, armazenamento local e integrações disponibilizadas pela plataforma.</p>
<h4>2. Conta</h4><p>Você deve fornecer informações verdadeiras, manter seus dados atualizados e proteger suas credenciais. A conta é pessoal, salvo funcionalidades administrativas ou de colaboração. Você é responsável pelas atividades realizadas mediante suas credenciais, exceto quando demonstrado uso indevido não causado por sua conduta.</p>
<h4>3. Senha e segurança</h4><p>Use senha forte, não reutilize credenciais importantes e não compartilhe tokens ou senhas. O Nexus poderá aplicar controles de segurança, limitação de tentativas e bloqueios preventivos. Nunca solicitaremos sua senha por meio de mensagens não autenticadas.</p>
<h4>4. Documentos e conteúdo do usuário</h4><p>Você mantém os direitos que possui sobre seus documentos. Ao utilizar recursos de armazenamento, você concede apenas as autorizações necessárias para que o Nexus hospede, processe, sincronize ou disponibilize o conteúdo conforme solicitado por você. Você garante que possui autorização para inserir, importar e compartilhar o conteúdo.</p>
<h4>5. Uso permitido</h4><p>O Nexus deve ser usado de forma lícita, ética e compatível com estes Termos. É proibido utilizar o serviço para fraude, invasão, distribuição de malware, violação de direitos de terceiros, tentativa de obter acesso não autorizado, abuso de APIs, exploração de vulnerabilidades sem autorização, spam, conteúdo ilícito ou qualquer atividade que comprometa a segurança, disponibilidade ou integridade do serviço.</p>
<h4>6. Colaboração e permissões</h4><p>Ao compartilhar documentos, adicionar usuários a grupos ou conceder permissões, você é responsável por verificar os destinatários e o nível de acesso concedido. A remoção de uma permissão não garante a recuperação de cópias que um terceiro tenha obtido legitimamente antes da revogação.</p>
<h4>7. Lixeira, exclusão e versões</h4><p>Recursos de lixeira, restauração, exclusão permanente, histórico e versões dependem da implementação vigente. Exclusão permanente pode ser irreversível. O usuário deve manter cópias de segurança de informações críticas.</p>
<h4>8. Armazenamento local</h4><p>Quando você escolhe uma pasta local, o Nexus depende das permissões concedidas pelo sistema operacional ou navegador. Arquivos locais podem permanecer sob controle do dispositivo mesmo após a remoção de uma referência dentro do Nexus.</p>
<h4>9. Integrações externas</h4><p>Integrações como Google Drive são serviços de terceiros. Seu uso depende da disponibilidade, regras, permissões e políticas do respectivo provedor. O Nexus não garante disponibilidade contínua de serviços externos que não controla.</p>
<h4>10. Atualizações e Korczak HUB Releases</h4><p>O Nexus pode consultar publicações oficiais e oferecer atualizações. Atualizações podem incluir correções, melhorias, mudanças de segurança, alterações de compatibilidade e novos recursos. A instalação deve ocorrer somente por canais oficiais. O usuário não deve modificar, adulterar ou substituir os pacotes distribuídos oficialmente.</p>
<h4>11. Licença de software</h4><p>O Korczak Nexus é distribuído sob <strong>licença fechada</strong>. Salvo autorização expressa, não é permitido copiar, redistribuir, sublicenciar, vender, alugar, realizar engenharia reversa na medida proibida pela legislação aplicável, remover avisos de propriedade intelectual ou criar obras derivadas do software proprietário.</p>
<h4>12. Propriedade intelectual</h4><p>Nome, marca, identidade visual, código proprietário, interfaces, textos e demais elementos pertencentes à Korczak Technologies ou seus licenciantes são protegidos pela legislação aplicável. Estes Termos não transferem propriedade intelectual ao usuário.</p>
<h4>13. Serviços gratuitos, pagos e disponibilidade</h4><p>Quando houver planos ou funcionalidades comerciais, condições específicas de preço, cobrança, cancelamento e reembolso poderão complementar estes Termos. O Código de Defesa do Consumidor e demais normas obrigatórias prevalecem quando aplicáveis. O serviço pode sofrer indisponibilidade por manutenção, falhas de infraestrutura, terceiros, força maior ou eventos de segurança.</p>
<h4>14. Suspensão e encerramento</h4><p>A conta pode ser suspensa ou encerrada quando necessário para segurança, cumprimento legal, proteção de usuários ou em caso de violação destes Termos. Sempre que juridicamente e operacionalmente possível, medidas serão proporcionais à situação. O encerramento não elimina obrigações que, por sua natureza, devam sobreviver.</p>
<h4>15. Responsabilidades do usuário</h4><p>O usuário é responsável pelo conteúdo inserido, pelas permissões concedidas, pela guarda de credenciais e pelo uso que fizer do serviço. Não utilize o Nexus como único mecanismo de backup de dados críticos.</p>
<h4>16. Responsabilidade da plataforma</h4><p>A Korczak Technologies adotará medidas razoáveis para manter o Nexus seguro e funcional, mas não garante funcionamento ininterrupto ou ausência absoluta de erros. Nada nestes Termos exclui ou limita direitos ou responsabilidades que a legislação brasileira considere indisponíveis.</p>
<h4>17. Feedback</h4><p>Sugestões e relatos podem ser enviados pelo recurso de feedback. O envio de uma sugestão não obriga a Korczak Technologies a implementá-la. Informações pessoais contidas no feedback serão tratadas conforme a Política de Privacidade.</p>
<h4>18. Alterações dos Termos</h4><p>Estes Termos podem ser atualizados para refletir evolução do serviço ou da legislação. Alterações relevantes serão comunicadas de maneira adequada. O uso continuado após a entrada em vigor de uma atualização, respeitados os direitos legais do usuário, representa ciência das novas condições.</p>
<h4>19. Proteção de dados</h4><p>O tratamento de dados pessoais é regido pela Política de Privacidade do Nexus. Em caso de conflito, os direitos previstos na legislação de proteção de dados e de defesa do consumidor prevalecem.</p>
<h4>20. Lei aplicável e foro</h4><p>Estes Termos são regidos pela legislação brasileira. Eventuais cláusulas de eleição de foro somente serão aplicadas quando juridicamente válidas e sem afastar o foro assegurado ao consumidor pela legislação.</p>
<h4>21. Contato</h4><p>Questões sobre o serviço podem ser encaminhadas pelos canais oficiais da Korczak Technologies ou pelo recurso “Relatar problema” disponível no Nexus.</p>
</div></Section>}
{view==='credits'&&<Section title="Créditos"><div className="legal-page">
<h3>Créditos — Korczak Nexus</h3><p><strong>Korczak HUB 2026 · Korczak Technologies</strong></p>
<h4>Produto</h4><p>Korczak Nexus — plataforma de documentos, armazenamento, organização, edição, colaboração, auditoria e integrações.</p>
<h4>Desenvolvimento e distribuição</h4><ul><li><strong>Desenvolvedor:</strong> Korczak Technologies.</li><li><strong>Ecossistema:</strong> Korczak HUB.</li><li><strong>Segurança e privacidade:</strong> KZSecurity.</li><li><strong>Distribuição e utilidades:</strong> Korczak Technologies.</li><li><strong>Atualizações:</strong> Korczak HUB Releases.</li></ul>
<h4>Arquitetura do produto</h4><ul><li><strong>Web:</strong> React, React DOM, TypeScript e Vite.</li><li><strong>API:</strong> FastAPI/Python, com NexusAPI v{NEXUS_API_VERSION}.</li><li><strong>Banco de dados:</strong> MongoDB.</li><li><strong>Android:</strong> aplicação nativa Android com Kotlin/AndroidX; a versão Android atual não depende de WebView para a interface principal.</li><li><strong>iOS:</strong> aplicação PWA separada.</li><li><strong>Publicação web:</strong> GitHub Pages.</li></ul>
<h4>Integrações</h4><p>O Nexus pode utilizar Google OAuth e Google Drive quando o usuário optar por conectar essa integração. As marcas e serviços de terceiros permanecem de propriedade de seus respectivos titulares.</p>
<h4>Dependências e projetos de terceiros</h4><p>O produto utiliza bibliotecas e componentes de código aberto ou de terceiros conforme os arquivos de dependências do projeto. Cada componente permanece sujeito à sua própria licença. A redistribuição dos avisos e licenças aplicáveis deve respeitar os termos de cada projeto.</p>
<h4>Direitos</h4><p>O software proprietário, a identidade visual e os materiais originais do Korczak Nexus permanecem protegidos. Créditos de terceiros não significam cessão ou transferência de direitos.</p>
<h4>Reconhecimentos</h4><p>Reconhecemos as comunidades de desenvolvimento e os projetos de software livre que tornam possível construir e manter aplicações modernas, seguras e interoperáveis.</p>
<h4>Contato</h4><p>Para reportar problemas de segurança, bugs ou atribuição incorreta de créditos, utilize “Relatar problema” no Nexus ou os canais oficiais da Korczak Technologies.</p>
</div></Section>}
{view==='settings'&&<Section title="Configurações"><div className="settings-list"><article><strong>Tema</strong><button onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?'Usar tema claro':'Usar tema escuro'}</button></article><article><strong>Armazenamento</strong><div className="settings-storage"><span>{storageSelection?storageLabel(storageSelection.provider):'Não configurado'}{storageSelection?.folderName&&<small>{storageSelection.folderName}</small>}</span><button onClick={()=>setShowStoragePicker(true)}>Alterar armazenamento</button></div></article><article><strong>Sessão</strong><span>{user.email}</span></article><article><strong>API "NexusAPI"</strong><span>API oficial de integração do Korczak Nexus.</span></article><article><strong>Atualizações</strong><div className="settings-storage"><span>{webRelease?<>Publicada: {webRelease.tag_name||"versão desconhecida"}<small>{webRelease.tag_name==="v1.0.0"?"Você está na versão web atual.":"Consulte a publicação oficial para conferir novidades."}</small></>:<span>Verifique a publicação mais recente do Nexus.</span>}</span><button onClick={checkWebRelease} disabled={webReleaseBusy}>{webReleaseBusy?"Verificando…":"Verificar atualização"}</button>{webReleaseError&&<small className="alert-error">{webReleaseError}</small>}</div></article><article><strong>Sair</strong><button onClick={async()=>{try{if(getToken())await api.logout()}catch{}finally{clearToken();setUser(null)}}}>Encerrar sessão</button></article></div></Section>}
      </main>
    </div>
    {feedbackOpen&&<Modal title="Dar um feedback" onClose={()=>{if(!feedbackBusy)setFeedbackOpen(false)}}>
<form className="modal-form" onSubmit={async e=>{e.preventDefault();if(feedbackBusy)return;const f=new FormData(e.currentTarget);setFeedbackBusy(true);try{await api.feedback({category:String(f.get("category")||"Geral"),message:String(f.get("message")||"").trim(),rating:Number(f.get("rating")||0)||null});setFeedbackSent(true);e.currentTarget.reset()}catch(x){setError(x instanceof Error?x.message:"Não foi possível enviar o feedback.")}finally{setFeedbackBusy(false)}}}>
{feedbackSent?<><p>Obrigado pelo feedback! Sua mensagem foi enviada para a equipe do Korczak Nexus.</p><Button type="button" onClick={()=>{setFeedbackSent(false);setFeedbackOpen(false)}}>Fechar</Button></>:
<><p>Conte para nós o que você achou do Nexus, encontrou um problema ou gostaria de sugerir uma melhoria.</p><label>Categoria<select name="category" defaultValue="Geral"><option>Geral</option><option>Sugestão</option><option>Problema</option><option>Experiência</option></select></label><label>Avaliação<select name="rating" defaultValue=""><option value="">Sem avaliação</option><option value="5">5 — Excelente</option><option value="4">4 — Muito bom</option><option value="3">3 — Bom</option><option value="2">2 — Pode melhorar</option><option value="1">1 — Ruim</option></select></label><label>Feedback<textarea name="message" rows={7} minLength={3} maxLength={5000} placeholder="Escreva seu feedback..." required/></label><Button type="submit" disabled={feedbackBusy}>{feedbackBusy?"Enviando…":"Enviar feedback"}</Button></>}</form></Modal>}
    {showStoragePicker&&<StoragePicker allowClose={Boolean(storageSelection)} onComplete={(provider)=>{const next=getStorageSelection();setStorageSelection(next||{provider,label:storageLabel(provider),connectedAt:new Date().toISOString()});setShowStoragePicker(false)}}/>}
    {moveModal&&selected&&<Modal title="Mover documento" onClose={()=>setMoveModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const d=await api.updateDocument(selected.id,{folder_id:String(f.get('folder')||'')||null});setSelected(await api.document(d.id));setMoveModal(false)}catch(x){setError(x instanceof Error?x.message:'Não foi possível mover o documento.')}}}><label>Pasta de destino<select name="folder" defaultValue={selected.folder_id||''}><option value="">Sem pasta</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><Button type="submit"><Icon name="folderOpen"/> <span>Mover</span></Button></form></Modal>}
    {modal&&view==='users'&&<Modal title={editingUser?'Editar usuário':'Novo usuário'} onClose={()=>setModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(editingUser){await api.adminUpdateUser(editingUser.id,{name:String(f.get('name')),phone:String(f.get('phone')),role:String(f.get('role'))});}else{await api.adminCreateUser({name:String(f.get('name')),email:String(f.get('email')),password:String(f.get('password')),phone:String(f.get('phone')||''),role:String(f.get('role'))});}setUsers(await api.users());setModal(false)}}><label>Nome<input name="name" defaultValue={editingUser?.name||''} required/></label><label>E-mail<input name="email" defaultValue={editingUser?.email||''} type="email" required disabled={!!editingUser}/></label>{!editingUser&&<label>Senha<input name="password" type="password" minLength={12} required/></label>}<label>Telefone<input name="phone" defaultValue={editingUser?.phone||''}/></label><label>Perfil<select name="role" defaultValue={editingUser?.role||'user'}><option value="user">Usuário</option><option value="manager">Gestor</option>{user.role==='admin'&&<option value="admin">Administrador</option>}</select></label><Button type="submit">Salvar</Button></form></Modal>}
    {modal&&view!=='users'&&<Modal title={view==='folders'?(editingFolder?'Renomear pasta':'Nova pasta'):'Novo documento'}  onClose={()=>setModal(false)}><form className="modal-form" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);if(view==='folders'){if(editingFolder)await api.updateFolder(editingFolder.id,{name:String(f.get('name'))});else await api.createFolder(String(f.get('name')),String(f.get('parent')||'')||null);setModal(false);load('folders')}else await createDocument(e)}}>{view==='folders'?<><label>Nome<input name="name" defaultValue={editingFolder?.name||''} required/></label>{!editingFolder&&<label>Pasta pai<select name="parent"><option value="">Raiz</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}</>:<><label>Nome<input name="name" required/></label><label>Descrição<input name="description" maxLength={2000}/></label><label>Tipo<input name="type" defaultValue="txt" required/></label><label>Pasta<select name="folder"><option value="">Sem pasta</option>{folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>Conteúdo<textarea name="content" rows={8}/></label></>}<Button type="submit">Salvar</Button></form></Modal>}
  </div>
}
export default App;
