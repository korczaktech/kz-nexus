import type {ButtonHTMLAttributes, ReactNode} from 'react';

type IconProps={name:string;size?:number;className?:string};

const paths:Record<string,ReactNode>={
  home:<><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5v10h5v-6h3v6h5v-10"/></>,
  file:<><path d="M6 2.8h7l5 5V21H6z"/><path d="M13 2.8V8h5"/><path d="M9 12h6M9 15.5h6"/></>,
  folder:<><path d="M3 6.5h6l2 2h10v10H3z"/><path d="M3 6.5V5h7l2 3.5"/></>,
  star:<path d="m12 3.4 2.65 5.37 5.93.86-4.29 4.18 1.01 5.91L12 16.93l-5.3 2.79 1.01-5.91-4.29-4.18 5.93-.86z"/>,
  clock:<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 2"/></>,
  trash:<><path d="M4.5 6.5h15M9 6.5V4h6v2.5M7 9v9.5h10V9M10 11.5v4.5M14 11.5v4.5"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  settings:<><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18"/><circle cx="12" cy="12" r="3.2"/></>,
  user:<><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.8-3.3 3-5 6.5-5s5.7 1.7 6.5 5"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3.8 20c.6-3.2 2.3-4.8 5.2-4.8s4.6 1.6 5.2 4.8"/><path d="M16 5.8a3 3 0 0 1 0 5.8M16 15.4c2.2.2 3.6 1.5 4.2 4"/></>,
  plus:<><path d="M12 4v16M4 12h16"/></>,
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
  menu:<><path d="M5 7h14M5 12h14M5 17h14"/></>,
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
