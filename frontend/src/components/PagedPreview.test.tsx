// @vitest-environment happy-dom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,describe,expect,it} from 'vitest';
import {PagedPreview} from './PagedPreview';
import type {NexusDocument} from '../../../packages/engine/src/index';

const documentModel:NexusDocument={
  id:'preview-doc',
  schemaVersion:1,
  metadata:{title:'Kortex preview test'},
  pageConfig:{unit:'pt',width:612,height:792,orientation:'portrait',margins:{top:36,right:36,bottom:36,left:36}},
  content:[{type:'paragraph',id:'preview-p',children:[{type:'text',id:'preview-run',text:'Native Kortex preview',marks:[]}]}],
  resources:[]
};

describe('Kortex native preview',()=>{
  let host:HTMLDivElement|undefined;
  let root:ReturnType<typeof createRoot>|undefined;
  afterEach(async()=>{
    if(root)await act(async()=>{root?.unmount()});
    host?.remove();host=undefined;root=undefined;
  });

  it('renders page geometry and canonical document text from the native layout',async()=>{
    host=window.document.createElement('div');
    window.document.body.append(host);
    root=createRoot(host);
    await act(async()=>{
      root?.render(createElement(PagedPreview,{
        html:'<p>Native Kortex preview</p>',
        css:'',
        document:documentModel,
        useNativeLayout:true,
        onClose:()=>{}
      }));
    });
    await act(async()=>{await Promise.resolve()});
    expect(host.querySelector('.kortex-native-page')).not.toBeNull();
    expect(host.querySelector('.kortex-native-pages')?.textContent).toContain('Native Kortex preview');
    expect(host.querySelector('.paged-preview-pages')?.children.length).toBe(0);
  });
});
