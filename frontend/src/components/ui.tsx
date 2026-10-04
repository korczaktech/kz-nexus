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
  home:<><path d="M4.2 10.7 12 4.1l7.8 6.6"/><path d="M6.2 9.2v9.7c0 .7.6 1.2 1.3 1.2h9c.7 0 1.3-.5 1.3-1.2V9.2"/><path d="M9.2 20.1v-5.6c0-.6.5-1.1 1.1-1.1h3.4c.6 0 1.1.5 1.1 1.1v5.6"/></>,
  nexusHome:<><path d="M4 10.8 12 4l8 6.8"/><path d="M6 9.3v9.5c0 .8.6 1.4 1.4 1.4h9.2c.8 0 1.4-.6 1.4-1.4V9.3"/><path d="M9 13.8c1.8-1.6 4.2-1.6 6 0v4.1H9z"/><path d="M10.2 9.2c1.1-.9 2.5-.9 3.6 0"/>,
  file:<><path d="M7.1 3.7h6.1l4.7 4.7v11.2c0 .9-.7 1.6-1.6 1.6H7.1c-.9 0-1.6-.7-1.6-1.6V5.3c0-.9.7-1.6 1.6-1.6Z"/><path d="M13 3.9v4.8h4.7"/><path d="M8.7 12.2h6.7M8.7 15.7h4.8"/><path d="M8.7 18.1h3.1"/>,
  folder:<><path d="M3.9 7.2c0-.9.7-1.6 1.6-1.6h4.4l2 2.1h6.6c.9 0 1.6.7 1.6 1.6v8.2c0 .9-.7 1.6-1.6 1.6H5.5c-.9 0-1.6-.7-1.6-1.6z"/><path d="M4.1 9.1c2.8-.8 5.3-.7 7.7.2 2.3.8 4.7.9 8.1.1"/>,
  folderOpen:<><path d="M4.1 8.1c0-.9.7-1.6 1.6-1.6h4.2l2 2h6.6c.9 0 1.5.7 1.5 1.6v1.2"/><path d="m4.2 19.2 2.2-7.4c.2-.6.7-1 1.3-1h12.2c.8 0 1.3.8 1 1.5l-2.1 6.1c-.2.6-.8 1-1.4 1H5.4c-.8 0-1.4-.1-1.2-.2Z"/><path d="M7.4 14.1h8.8"/>,
  star:<><path d="m12 3.8 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6-4.8 2.6.9-5.5-4-3.9 5.5-.8z"/><path d="M9.2 12.2c1.7-1.1 3.9-1.1 5.6 0"/>,
  clock:<><path d="M12 3.8c4.7 0 8.5 3.7 8.5 8.2s-3.8 8.2-8.5 8.2-8.5-3.7-8.5-8.2S7.3 3.8 12 3.8Z"/><path d="M12 7.2v5l3.4 2"/><path d="M7.4 5.9c.8-.7 1.7-1.2 2.7-1.6"/>,
  trash:<><path d="M5.3 7.3h13.4"/><path d="M9 7.3V5.1c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1v2.2"/><path d="M7.2 9.4v9.1c0 1 .8 1.8 1.8 1.8h6c1 0 1.8-.8 1.8-1.8V9.4"/><path d="M10.1 12v5.2M13.9 12v5.2"/><path d="M4.1 7.3c.4-.8 1.1-1.3 2-1.3h11.8c.9 0 1.6.5 2 1.3"/>,
  search:<><circle cx="10.7" cy="10.7" r="6.7"/><path d="m15.6 15.6 4.1 4.1"/><path d="M8.4 10.7c.9-1.6 2.1-2.4 3.7-2.4"/>,
  settings:<><path d="M12 4.1c.7 0 1.4.1 2 .3l1.2-1 2.1 2.1-1 1.2c.4.6.6 1.3.8 2l1.5.4v3l-1.5.4c-.2.7-.4 1.4-.8 2l1 1.2-2.1 2.1-1.2-1c-.6.3-1.3.6-2 .8l-.4 1.5h-3l-.4-1.5c-.7-.2-1.4-.5-2-.8l-1.2 1-2.1-2.1 1-1.2c-.4-.6-.6-1.3-.8-2L2.6 12v-3l1.5-.4c.2-.7.4-1.4.8-2l-1-1.2L6 3.4l1.2 1c.6-.3 1.3-.6 2-.8l.4-1.5z"/><circle cx="12" cy="10.5" r="2.7"/>,
  user:<><path d="M12 4.1c2 0 3.5 1.5 3.5 3.5S14 11.1 12 11.1 8.5 9.6 8.5 7.6 10 4.1 12 4.1Z"/><path d="M5.2 19.7c.8-3.5 3-5.4 6.8-5.4s6 1.9 6.8 5.4"/><path d="M7.1 18.1c1.5-.8 3.2-1.2 4.9-1.2s3.4.4 4.9 1.2"/>,
  users:<><path d="M9 4.7c1.9 0 3.3 1.4 3.3 3.2S10.9 11.1 9 11.1 5.7 9.7 5.7 7.9 7.1 4.7 9 4.7Z"/><path d="M3.6 19.5c.7-3.2 2.4-5 5.4-5s4.7 1.8 5.4 5"/><path d="M15.2 5.8c1.7.2 2.8 1.3 2.8 2.8 0 1.2-.7 2.2-1.8 2.6"/><path d="M15.2 14.8c2.6.3 4.2 1.8 4.9 4.7"/>,
  plus:<><path d="M12 5.5v13"/><path d="M5.5 12h13"/><path d="M8.2 7.1c2.2-1.8 5.4-1.8 7.6 0"/>,
  plusCircle:<><circle cx="12" cy="12" r="8.8"/><path d="M12 7.2v9.6M7.2 12h9.6"/><path d="M8.4 8.4c2-1.5 5.2-1.5 7.2 0"/>,
  image:<><rect x="3.7" y="4.3" width="16.6" height="15.4" rx="3.2"/><circle cx="8.3" cy="9.1" r="1.4"/><path d="m5.2 17.1 4.2-3.9 3.2 2.6 2.7-2.3 3.5 2.9"/><path d="M16.4 7.2h1.3"/>,
  video:<><rect x="3.7" y="5.2" width="12.3" height="13.6" rx="3.1"/><path d="m16 9.4 4.1-2.1v9.4L16 14.6"/><path d="M7.4 9.2c1.7 1.1 2.6 2.3 2.7 4.3"/>,
  more:<><path d="M5.1 12c1.3-1.2 2.6-1.2 3.8 0-1.2 1.2-2.5 1.2-3.8 0ZM10.1 12c1.3-1.2 2.6-1.2 3.8 0-1.2 1.2-2.5 1.2-3.8 0ZM15.1 12c1.3-1.2 2.6-1.2 3.8 0-1.2 1.2-2.5 1.2-3.8 0Z"/>,
  grid:<><rect x="4.2" y="4.2" width="6.2" height="6.2" rx="2.4"/><rect x="13.6" y="4.2" width="6.2" height="6.2" rx="2.4"/><rect x="4.2" y="13.6" width="6.2" height="6.2" rx="2.4"/><rect x="13.6" y="13.6" width="6.2" height="6.2" rx="2.4"/><path d="M7.2 12h9.6"/>,
  sign:<><path d="m5.2 18.5 2.4-.5L18.3 7.3c.9-.9.9-2.2 0-3.1s-2.2-.9-3.1 0L4.5 15.1z"/><path d="m13.9 6.3 3.8 3.8"/><path d="M6.7 19.3h10.6"/>,
  scan:<><path d="M7 3.9H5.3c-.9 0-1.5.6-1.5 1.5v1.7M17 3.9h1.7c.9 0 1.5.6 1.5 1.5v1.7M7 20.1H5.3c-.9 0-1.5-.6-1.5-1.5v-1.7M17 20.1h1.7c.9 0 1.5-.6 1.5-1.5v-1.7"/><path d="M7.1 9.2c3.2-1.3 6.6-1.3 9.8 0M7.1 12c3.2-1.3 6.6-1.3 9.8 0M7.1 14.8c3.2-1.3 6.6-1.3 9.8 0"/>,
  cloud:<><path d="M7.2 18.6h9.2c2.2 0 3.9-1.7 3.9-3.8 0-2-1.6-3.7-3.6-3.8-.7-3.3-3-5.1-5.9-5.1-3.1 0-5.5 2.1-5.9 5.1-1.8.3-3.1 1.8-3.1 3.7 0 2.2 1.7 3.9 5.4 3.9Z"/><path d="M8.2 14.2c1.1-.9 2.3-.9 3.5 0 1.1.9 2.3.9 3.5 0"/>,
  storage:<><path d="M5.1 5.1c2.1-1 4.4-1.5 6.9-1.5s4.8.5 6.9 1.5v13.8c-2.1 1-4.4 1.5-6.9 1.5s-4.8-.5-6.9-1.5z"/><path d="M5.1 9.5c2.1 1 4.4 1.5 6.9 1.5s4.8-.5 6.9-1.5M5.1 13.7c2.1 1 4.4 1.5 6.9 1.5s4.8-.5 6.9-1.5"/><path d="M9 6.8h6"/>,
  upload:<><path d="M12 16V4.7"/><path d="m8 8.7 4-4 4 4"/><path d="M5.2 14.4v3.3c0 .9.7 1.6 1.6 1.6h10.4c.9 0 1.6-.7 1.6-1.6v-3.3"/><path d="M9 15.2c1.9.8 4.1.8 6 0"/>,
  edit:<><path d="m5.1 18.8 2.9-.7L18.2 8a2.3 2.3 0 0 0-3.3-3.3L4.7 15.8z"/><path d="m13.9 6.8 3.3 3.3"/><path d="M6.2 18.6c2.2-1.1 4.4-1.1 6.7 0"/>,
  editSquare:<><path d="M7 3.8h10c1.8 0 3.2 1.4 3.2 3.2v10c0 1.8-1.4 3.2-3.2 3.2H7c-1.8 0-3.2-1.4-3.2-3.2V7c0-1.8 1.4-3.2 3.2-3.2Z"/><path d="m8 15.9.9-3.1 6.4-6.4a1.8 1.8 0 0 1 2.5 2.5l-6.4 6.4z"/><path d="m14.6 7.4 2 2"/>,
  menu:<><path d="M5 7.1c2.2-1 4.5-1.4 7-1.4s4.8.4 7 1.4"/><path d="M5 12c2.2-1 4.5-1.4 7-1.4s4.8.4 7 1.4"/><path d="M5 16.9c2.2-1 4.5-1.4 7-1.4s4.8.4 7 1.4"/>,
  gridMenu:<><rect x="4.2" y="4.2" width="6.2" height="6.2" rx="2.4"/><rect x="13.6" y="4.2" width="6.2" height="6.2" rx="2.4"/><rect x="4.2" y="13.6" width="6.2" height="6.2" rx="2.4"/><rect x="13.6" y="13.6" width="6.2" height="6.2" rx="2.4"/><path d="M9.3 12h5.4"/>,
  arrowRight:<><path d="M4.2 12c3.8-1.1 8.1-1.1 12.7 0"/><path d="m13.5 7.7 4.7 4.3-4.7 4.3"/><path d="M7.3 8.7c.9-.8 1.8-1.2 2.8-1.4"/>,
  chevronDown:<path d="m6.8 9.4 5.2 5.2 5.2-5.2"/>,
  chevronRight:<path d="m9.2 6.9 5.1 5.1-5.1 5.1"/>,
  close:<><path d="M7 7c1.9 1.1 3.5 2.9 5 5 1.5-2.1 3.1-3.9 5-5"/><path d="M7 17c1.9-1.1 3.5-2.9 5-5 1.5 2.1 3.1 3.9 5 5"/>,
  check:<path d="M5.4 12.4c2.1-.4 3.5.4 4.5 2.4 2.2-3.7 4.8-6 8.7-7.2"/>,
  shield:<><path d="M12 3.6c2.3 1.2 4.7 2 7.1 2.5v5.1c0 4.2-2.4 7.5-7.1 9.2-4.7-1.7-7.1-5-7.1-9.2V6.1c2.4-.5 4.8-1.3 7.1-2.5Z"/><path d="M8.2 12.2c1.2.2 2.1.8 2.8 2 1.4-2.3 2.9-3.8 5.1-4.7"/></>
};

export const Icon=({name,size=18,className=''}:IconProps)=><svg className={'icon-svg '+className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.more}</svg>;

type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string};
export function Button({children,variant='primary',className='',...props}:ButtonProps){return <button className={'button button-'+variant+(className?' '+className:'')} {...props}>{children}</button>}
export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true"><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><Icon name="close" size={20}/></button></header>{children}</section></div>}
export function StatePanel({title,message}:{title:string;message:string}){return <div className="state-panel"><div className="state-mark"><Icon name="file" size={28}/></div><h3>{title}</h3><p>{message}</p></div>}
