import type {ButtonHTMLAttributes, ReactNode} from 'react';

type IconProps={name:string;size?:number;className?:string};

const paths:Record<string,ReactNode>={
  undo:<><path d="M9 7H4v5"/><path d="M4 12c1.9-4.2 7.2-6.2 11.4-4.1 3.4 1.6 5.2 5.5 3.8 9"/><path d="m4 12 3.5-3.5"/></>,
  redo:<><path d="M15 7h5v5"/><path d="M20 12c-1.9-4.2-7.2-6.2-11.4-4.1-3.4 1.6-5.2 5.5-3.8 9"/><path d="m20 12-3.5-3.5"/></>,
  bold:<><path d="M8 5h5a3 3 0 0 1 0 6H8z"/><path d="M8 11h6a3 3 0 0 1 0 6H8z"/><path d="M8 5v12"/></>,
  italic:<><path d="M10 5h7M7 19h7M14 5 10 19"/></>,
  underline:<><path d="M7 5v6a5 5 0 0 0 10 0V5"/><path d="M5 20h14"/></>,
  strike:<><path d="M7 7.5c.8-2.5 5.9-3.2 8.5-1.3 1.1.8 1.5 1.8 1.2 2.8"/><path d="M6 16.5c1.3 2.1 5.8 2.7 8.4 1.1 1-.6 1.5-1.4 1.6-2.3"/><path d="M4 12h16"/></>,
  list:<><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r=".9" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="5" cy="18" r=".9" fill="currentColor" stroke="none"/></>,
  listNumber:<><path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5h1v3M4 8h2M4 11.5c.4-.5 1.5-.5 1.5.3 0 .7-1.5 1.2-1.5 2.2h1.7M4 17h1.4c.6 0 .9.9.3 1.2-.4.2-1.2.1-1.7.1"/></>,
  alignLeft:<><path d="M5 6h14M5 10h10M5 14h14M5 18h10"/></>,
  alignCenter:<><path d="M6 6h12M4 10h16M6 14h12M5 18h14"/></>,
  alignRight:<><path d="M5 6h14M9 10h10M5 14h14M9 18h10"/></>,
  alignJustify:<><path d="M5 6h14M5 10h14M5 14h14M5 18h14"/></>,
  outdent:<><path d="M9 6h11M9 12h11M9 18h11"/><path d="m6 9-3 3 3 3"/><path d="M3 12h6"/></>,
  indent:<><path d="M9 6h11M9 12h11M9 18h11"/><path d="m6 9 3 3-3 3"/><path d="M3 12h6"/></>,
  link:<><path d="M9.5 14.5 8 16a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0"/><path d="m14.5 9.5 1.5-1.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0"/><path d="m8.5 15.5 7-7"/></>,
  table:<><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M4 14h16M10 5v14M15 5v14"/></>,
  horizontalRule:<><path d="M4 12h16"/><circle cx="4" cy="12" r="1"/><circle cx="20" cy="12" r="1"/></>,
  textColor:<><path d="M7 18 12 5l5 13M9 14h6"/><path d="M5 20h14"/></>,
  highlight:<><path d="m7 15 7.8-7.8a2 2 0 0 1 2.8 2.8L9.8 17.8 6 18z"/><path d="M5 21h14"/></>,
  clearFormat:<><path d="M6 5h12M9 5l3 14M15 5l-3 5"/><path d="m5 19 14-14"/></>,
  save:<><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
  download:<><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></>,
  lock:<><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  zoom:<><circle cx="10.5" cy="10.5" r="6.2"/><path d="m15 15 5 5"/><path d="M8 10.5h5M10.5 8v5"/></>,
  minus:<path d="M6 12h12"/>,  home:<><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5v10h5v-6h3v6h5v-10"/></>,
  nexusHome:<><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.8 9.8v9.7h12.4V9.8"/><path d="M9.2 19.5v-5.2h5.6v5.2"/></>,
  file:<><path d="M6 2.8h7l5 5V21H6z"/><path d="M13 2.8V8h5"/><path d="M9 12h6M9 15.5h6"/></>,
  folder:<><path d="M3 7h6.1l2 2H21v10H3z"/><path d="M3 7V5h7l2 3"/></>,
  folderOpen:<><path d="M3 7h7l2 2h9v3"/><path d="M4 19h15l2-7H6z"/></>,
  star:<path d="m12 3.4 2.65 5.37 5.93.86-4.29 4.18 1.01 5.91L12 16.93l-5.3 2.79 1.01-5.91-4.29-4.18 5.93-.86z"/>,
  clock:<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></>,
  trash:<><path d="M4.5 6.5h15M9 6.5V4h6v2.5M7 9v9.5h10V9M10 11.5v4.5M14 11.5v4.5"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  settings:<><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18"/><circle cx="12" cy="12" r="3.2"/></>,
  user:<><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3.8 20c.6-3.2 2.3-4.8 5.2-4.8s4.6 1.6 5.2 4.8"/><path d="M16 5.8a3 3 0 0 1 0 5.8M16 15.4c2.2.2 3.6 1.5 4.2 4"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  plusCircle:<><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
  image:<><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.4"/><path d="m4.5 17 4.5-4 3 2.5 2.5-2 5 4"/></>,
  video:<><rect x="3.5" y="5" width="13" height="14" rx="2"/><path d="m16.5 10 4-2v8l-4-2z"/></>,
  more:<><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></>,
  grid:<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  sign:<><path d="m5 19 2.2-.5L18 7.7a2 2 0 0 0-2.8-2.8L4.4 15.7z"/><path d="m14.5 6.5 3 3"/></>,
  scan:<><path d="M5 3H3v4M19 3h2v4M5 21H3v-4M19 21h2v-4"/><path d="M7 8h10M7 12h10M7 16h10"/></>,
  cloud:<><path d="M7 18.5h9.5a4 4 0 0 0 .7-7.94A5.8 5.8 0 0 0 6 9.5a4.5 4.5 0 0 0 1 9z"/></>,
  storage:<><path d="M5 5h14v14H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  upload:<><path d="M12 16V4M12 4 7 9M12 4l5 5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></>,
  edit:<><path d="m5 19 3.2-.7L18.5 8a2.1 2.1 0 0 0-3-3L5.2 15.3z"/><path d="m14.2 6.8 3 3"/></>,
  editSquare:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 16 1-3.2L15.8 6a1.8 1.8 0 0 1 2.5 2.5l-6.8 6.8z"/><path d="m14.7 7.3 2 2"/></>,
  menu:<><path d="M5 7h14M5 12h14M5 17h14"/></>,
  gridMenu:<><rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><rect x="14" y="14" width="6" height="6" rx="1.2"/></>,
  arrowRight:<><path d="M4 12h15"/><path d="m14 7 5 5-5 5"/></>,
  chevronDown:<path d="m7 10 5 5 5-5"/>,
  chevronRight:<path d="m9 6 6 6-6 6"/>,
  close:<><path d="m6 6 12 12M18 6 6 18"/></>,
  check:<path d="m5 12 4.2 4.2L19 6.5"/>,
  shield:<><path d="M12 3.5 19 6v5.2c0 4.2-2.8 7.4-7 9.3-4.2-1.9-7-5.1-7-9.3V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>
};

export const Icon=({name,size=18,className=''}:IconProps)=><svg className={'icon-svg '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.more}</svg>;

type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string};
export function Button({children,variant='primary',className='',...props}:ButtonProps){return <button className={'button button-'+variant+(className?' '+className:'')} {...props}>{children}</button>}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" size={20}/></button></header>{children}</section></div>}
export function StatePanel({title,message}:{title:string;message:string}){return <div className="state-panel"><div className="state-mark"><Icon name="file" size={28}/></div><h3>{title}</h3><p>{message}</p></div>}
