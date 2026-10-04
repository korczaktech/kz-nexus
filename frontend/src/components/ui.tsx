import type {ButtonHTMLAttributes, ReactNode} from 'react';

type IconProps={name:string;size?:number;className?:string};

const paths:Record<string,ReactNode>={
  undo:<><path d="M8.5 8H4.2l2.5-2.5"/><path d="M4.5 8.2a8 8 0 1 1 .8 7.8"/><path d="M4.2 8 7 10.8"/></>,
  redo:<><path d="M15.5 8h4.3l-2.5-2.5"/><path d="M19.5 8.2a8 8 0 1 0-.8 7.8"/><path d="m19.8 8-2.8 2.8"/></>,
  bold:<><path d="M8 5.2h5a3.1 3.1 0 0 1 0 6.2H8z"/><path d="M8 11.4h5.8a3.5 3.5 0 0 1 0 7H8z"/><path d="M8 5.2v13.2"/></>,
  italic:<><path d="M10 5.5h6.5M7.5 18.5H14"/><path d="m14 5.5-4 13"/></>,
  underline:<><path d="M7.5 5.5v5.2a4.5 4.5 0 0 0 9 0V5.5"/><path d="M5.5 19h13"/></>,
  strike:<><path d="M7.2 7.7c1-2.2 5.7-2.8 8-1.2 1 .7 1.5 1.6 1.3 2.5"/><path d="M7 16.3c1.4 2 5.5 2.4 7.8.9 1-.6 1.5-1.3 1.6-2.2"/><path d="M4.5 12h15"/></>,
  list:<><path d="M9.5 6.5h10M9.5 12h10M9.5 17.5h10"/><circle cx="5.2" cy="6.5" r="1"/><circle cx="5.2" cy="12" r="1"/><circle cx="5.2" cy="17.5" r="1"/></>,
  listNumber:<><path d="M10.5 6.5h9M10.5 12h9M10.5 17.5h9"/><path d="M4.5 5.2h1v3.1M4.4 8.3h2"/><path d="M4.5 11.1c2.2-1 2.5 1.5.2 2.4-.7.3-.8.9-.2 1.1h2"/><path d="M4.5 17h1.4a1 1 0 0 1 .2 2H4.5"/></>,
  alignLeft:<><path d="M5 6.5h14M5 10.5h10M5 14.5h14M5 18.5h10"/></>,
  alignCenter:<><path d="M7 6.5h10M5 10.5h14M7 14.5h10M6 18.5h12"/></>,
  alignRight:<><path d="M5 6.5h14M9 10.5h10M5 14.5h14M9 18.5h10"/></>,
  alignJustify:<><path d="M5 6.5h14M5 10.5h14M5 14.5h14M5 18.5h14"/></>,
  outdent:<><path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="m7 9.5-3 2.5 3 2.5"/><path d="M4 12h6"/></>,
  indent:<><path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="m4 9.5 3 2.5-3 2.5"/><path d="M4 12h6"/></>,
  link:<><path d="M9.3 14.7 7.7 16.3a3.4 3.4 0 0 1-4.8-4.8l2.8-2.8a3.4 3.4 0 0 1 4.8 0"/><path d="m14.7 9.3 1.6-1.6a3.4 3.4 0 0 1 4.8 4.8l-2.8 2.8a3.4 3.4 0 0 1-4.8 0"/><path d="m8.5 15.5 7-7"/></>,
  table:<><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16M4 14.5h16M10 5v14M15 5v14"/></>,
  horizontalRule:<><path d="M5 12h14"/><circle cx="5" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>,
  textColor:<><path d="m7.2 17.8 4.8-12 4.8 12M9 13.5h6"/><path d="M5 20h14"/></>,
  highlight:<><path d="m6.5 15.5 7.7-7.7a2.2 2.2 0 0 1 3.1 3.1l-7.7 7.7-4.2 1z"/><path d="M5 21h14"/></>,
  clearFormat:<><path d="M6 5.5h11M9 5.5l3 13M15 5.5l-3 5"/><path d="m5 19 14-14"/></>,
  save:<><path d="M5 5.2c0-.7.5-1.2 1.2-1.2h10.6L19 6.2v12.6c0 .7-.5 1.2-1.2 1.2H6.2c-.7 0-1.2-.5-1.2-1.2z"/><path d="M8 4v6h8V4M8 20v-5h8v5"/></>,
  download:<><path d="M12 4.5v10"/><path d="m8 11 4 4 4-4"/><path d="M5 19.5h14"/></>,
  lock:<><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/></>,
  zoom:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 4.5 4.5"/><path d="M8 10.5h5M10.5 8v5"/></>,
  minus:<path d="M6.5 12h11"/>,
  home:<><path d="M3.8 10.7 12 3.8l8.2 6.9"/><path d="M5.7 9.8v9.7h12.6V9.8"/><path d="M9.5 19.5v-5.2h5v5.2"/></>,
  nexusHome:<><path d="M3.8 10.7 12 3.8l8.2 6.9"/><path d="M5.7 9.8v9.7h12.6V9.8"/><path d="M9.2 19.5v-5.4h5.6v5.4"/><circle cx="12" cy="9" r="1.2"/></>,
  file:<><path d="M6 3.5h7l5 5v12H6z"/><path d="M13 3.5v5h5"/><path d="M9 12h6M9 15.5h5"/></>,
  folder:<><path d="M3.5 7h6l2 2h9v10.5h-17z"/><path d="M3.5 7V5.2h7l1.8 2.2"/></>,
  folderOpen:<><path d="M3.5 7h6.5l2 2h8.5v2"/><path d="m4 19 2.2-7.2h15L19 19z"/></>,
  star:<><path d="M12 3.8 14.5 9l5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4L9.5 9z"/><circle cx="12" cy="12" r="8.8" opacity=".16" stroke="currentColor"/></>,
  clock:<><circle cx="12" cy="12" r="8.6"/><path d="M12 7.3v5.1l3.2 2"/><circle cx="12" cy="12" r="1"/></>,
  trash:<><path d="M5 7h14M9 7V4.5h6V7"/><path d="M7 9v9.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5V9"/><path d="M10 11.5v5M14 11.5v5"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.4 15.4 4.1 4.1"/><circle cx="10.5" cy="10.5" r="2" opacity=".15" stroke="currentColor"/></>,
  settings:<><circle cx="12" cy="12" r="3.3"/><path d="M12 3.8v2M12 18.2v2M3.8 12h2M18.2 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4"/></>,
  user:<><circle cx="12" cy="8.2" r="3"/><path d="M5.3 19.5c.8-3.2 3-5 6.7-5s5.9 1.8 6.7 5"/><circle cx="12" cy="12" r="9" opacity=".12" stroke="currentColor"/></>,
  users:<><circle cx="9" cy="8.2" r="3"/><path d="M3.8 19.5c.6-3 2.4-4.7 5.2-4.7s4.6 1.7 5.2 4.7"/><path d="M16 5.8a3 3 0 0 1 0 5.7M15.7 15.2c2.2.4 3.6 1.8 4.1 4.3"/></>,
  plus:<><circle cx="12" cy="12" r="8.2" opacity=".16" stroke="currentColor"/><path d="M12 7v10M7 12h10"/></>,
  plusCircle:<><circle cx="12" cy="12" r="8.8"/><path d="M12 7.5v9M7.5 12h9"/></>,
  image:<><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="8.5" cy="9" r="1.4"/><path d="m4.8 17 4.3-4 3 2.4 2.6-2.1 4.5 3.7"/></>,
  video:<><rect x="3.5" y="5.2" width="12.5" height="13.6" rx="3"/><path d="m16 10 4.5-2.2v8.4L16 14"/></>,
  more:<><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/></>,
  grid:<><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></>,
  sign:<><path d="m5 18.8 2.3-.6L18.4 7.1a2.2 2.2 0 0 0-3.1-3.1L4.2 15.9z"/><path d="m14.5 6.5 3 3"/></>,
  scan:<><path d="M6 3.5H4v4M18 3.5h2v4M6 20.5H4v-4M18 20.5h2v-4"/><path d="M7 8.5h10M7 12h10M7 15.5h10"/></>,
  cloud:<><path d="M7 18.5h9.3a4 4 0 0 0 .8-7.9A5.8 5.8 0 0 0 6 9.7a4.5 4.5 0 0 0 1 8.8z"/><path d="M9 14.5c1.5-1.8 4.5-1.8 6 0"/></>,
  storage:<><rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/><circle cx="17" cy="15.5" r=".8" fill="currentColor" stroke="none"/></>,
  upload:<><path d="M12 16V4.5M8 8.5l4-4 4 4"/><path d="M5 14.5v3.2c0 1 .8 1.8 1.8 1.8h10.4c1 0 1.8-.8 1.8-1.8v-3.2"/></>,
  edit:<><path d="m5 18.8 3-.7L18.1 8a2.2 2.2 0 0 0-3.1-3.1L4.9 15z"/><path d="m14.2 6.8 3 3"/><circle cx="18.5" cy="18.5" r="2.5" opacity=".16" stroke="currentColor"/></>,
  editSquare:<><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 16 1-3.2L15.8 6a1.8 1.8 0 0 1 2.5 2.5l-6.8 6.8z"/><path d="m14.7 7.3 2 2"/></>,
  menu:<><path d="M5 7.2c3.8-1.2 10.2-1.2 14 0M5 12c3.8-1.2 10.2-1.2 14 0M5 16.8c3.8-1.2 10.2-1.2 14 0"/></>,
  gridMenu:<><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></>,
  arrowRight:<><path d="M4.5 12h14"/><path d="m14 7.5 4.5 4.5-4.5 4.5"/></>,
  chevronDown:<path d="m7.5 10 4.5 4.5 4.5-4.5"/>,
  chevronRight:<path d="m9.5 6.8 5.2 5.2-5.2 5.2"/>,
  close:<><path d="m7 7 10 10M17 7 7 17"/></>,
  check:<path d="m5.5 12.2 4.1 4.1 9-9"/>,
  shield:<><path d="M12 3.7 19 6.4v5c0 4.2-2.8 7.4-7 9.2-4.2-1.8-7-5-7-9.2v-5z"/><path d="m8.4 12 2.3 2.3 4.9-5"/><circle cx="12" cy="12" r="8.8" opacity=".12" stroke="currentColor"/></>
};

export const Icon=({name,size=18,className=''}:IconProps)=><svg className={'icon-svg '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.more}</svg>;

type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string};
export function Button({children,variant='primary',className='',...props}:ButtonProps){return <button className={'button button-'+variant+(className?' '+className:'')} {...props}>{children}</button>}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" size={20}/></button></header>{children}</section></div>}
export function StatePanel({title,message}:{title:string;message:string}){return <div className="state-panel"><div className="state-mark"><Icon name="file" size={28}/></div><h3>{title}</h3><p>{message}</p></div>}
