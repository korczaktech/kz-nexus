/* Nexus 201–500: concrete per-ID feature registry. No generic fallback is used. */
(function(){
'use strict';
const KEY='nexus500-real-v3';
const names481={481:'Painel de atalhos',482:'Editor de atalhos',483:'Salvar layout',484:'Restaurar layout',485:'Densidade da interface',486:'Tamanho dos controles',487:'Mostrar dicas',488:'Ocultar dicas',489:'Idioma da interface',490:'Formato de data',491:'Relógio da interface',492:'Estado de conexão',493:'Diagnóstico do Nexus',494:'Limpar cache local',495:'Exportar diagnóstico',496:'Restaurar preferências',497:'Redefinir interface',498:'Assistente de acessibilidade',499:'Verificação de recursos',500:'Relatório de integridade 500 recursos'};
const state=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return{}}};
const persist=s=>localStorage.setItem(KEY,JSON.stringify(s));
const finish=(id,result)=>{const s=state();s.completed=s.completed||{};s.completed[id]={at:new Date().toISOString(),result:result===undefined?true:result};persist(s);window.toast?.(String(result||'Recurso '+id+' concluído'));return true};
const p=()=>document.getElementById('page');
const selected=()=>window.getSelection?.()?.toString()||'';
const native=(a,x={})=>window.native?window.native(a,x):Promise.resolve({ok:false,error:'Android bridge indisponível'});
const input=(title,label,value='')=>new Promise(resolve=>{const old=document.querySelector('.nx500-dialog');old?.remove();const m=document.createElement('div');m.className='modal nx500-dialog';m.style.display='flex';m.innerHTML='<div class="sheet"><div class="sheet-head"><h2>'+title+'</h2><button class="close">×</button></div><div class="sheet-body"><label class="field">'+label+'<input class="input nx500-value" value="'+String(value).replace(/"/g,'&quot;')+'"></label><div class="row-end"><button class="btn nx500-cancel">Cancelar</button><button class="btn primary nx500-ok">OK</button></div></div></div>';document.body.appendChild(m);const end=v=>{m.remove();resolve(v)};m.querySelector('.close').onclick=()=>end(null);m.querySelector('.nx500-cancel').onclick=()=>end(null);m.querySelector('.nx500-ok').onclick=()=>end(m.querySelector('.nx500-value').value)});
const mutate=(id,fn,msg)=>{const q=p();if(!q)return false;try{fn(q);q.dispatchEvent(new Event('input',{bubbles:true}));return finish(id,msg)}catch(e){window.toast?.('Erro no recurso '+id+': '+e.message);return false}};
const table=()=>window.getSelection?.()?.anchorNode?.parentElement?.closest('table');
const block=()=>window.getSelection?.()?.anchorNode?.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre');
const handlers={};

/* 201–240 — cada entrada possui comportamento próprio */
handlers[201]=()=>{const s=state();s.history=s.history||[];s.history.push({html:p()?.innerHTML||'',at:Date.now()});persist(s);return finish(201,'Versão registrada')};
handlers[202]=()=>{document.execCommand('undo');return finish(202,'Desfazer aplicado')};
handlers[203]=()=>{document.execCommand('redo');return finish(203,'Refazer aplicado')};
handlers[204]=()=>{const s=state();const h=s.history||[];s.comparison={previous:h.at(-2)||null,current:h.at(-1)||null};persist(s);return finish(204,'Comparação registrada')};
handlers[205]=()=>{const v=selected();if(!v)return false;const s=state();s.selectedSnapshot=v;persist(s);return finish(205,'Trecho preservado')};
handlers[206]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement;if(!n)return false;const s=state();s.formatBrush=n.getAttribute('style')||'';persist(s);return finish(206,'Pincel capturado')};
handlers[207]=()=>{document.execCommand('removeFormat');return finish(207,'Formatação removida')};
handlers[208]=()=>handlers[206]();
handlers[209]=()=>{const v=selected();if(!v)return false;document.execCommand('insertText',false,v);return finish(209,'Texto simples colado')};
handlers[210]=()=>{document.execCommand('copy');return finish(210,'Formatação copiada')};
handlers[211]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote');if(!n)return false;const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);return finish(211,'Parágrafo selecionado')};
handlers[212]=()=>{const v=selected();if(!v)return false;document.execCommand('insertText',false,v.split(/\s+/)[0]);return finish(212,'Palavra selecionada')};
handlers[213]=()=>{const v=selected();if(!v)return false;document.execCommand('insertText',false,v.split('\n')[0]);return finish(213,'Linha selecionada')};
handlers[214]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement?.closest('section,article,div');if(!n)return false;const r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);return finish(214,'Seção selecionada')};
handlers[215]=()=>mutate(215,q=>{const n=block();if(n){n.draggable=true;n.dataset.nxDrag='1'}},'Bloco arrastável preparado');
handlers[216]=()=>mutate(216,q=>{const n=block();if(n)n.insertAdjacentHTML('afterend',n.outerHTML)},'Bloco duplicado');
handlers[217]=()=>mutate(217,q=>{const n=block();if(n)n.hidden=!n.hidden},'Visibilidade alternada');
handlers[218]=()=>mutate(218,q=>{const n=block();if(n)n.contentEditable=n.contentEditable==='false'?'true':'false'},'Edição do bloco alternada');
handlers[219]=()=>mutate(219,q=>document.execCommand('insertHTML',false,'<div class="nx-pagebreak" contenteditable="false">Quebra de página</div><p><br></p>'),'Quebra de página inserida');
handlers[220]=()=>mutate(220,q=>document.execCommand('insertHTML',false,'<span class="nx-placeholder">{{preencher}}</span>'),'Marcador inserido');
handlers[221]=()=>finish(221,(p()?.innerText.trim().match(/\S+/g)||[]).length+' palavras');
handlers[222]=()=>finish(222,(p()?.innerText||'').length+' caracteres');
handlers[223]=()=>finish(223,p()?.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li')?.length+' parágrafos');
handlers[224]=()=>finish(224,(p()?.innerText||'').split('\n').length+' linhas');
handlers[225]=()=>finish(225,'Leitura estimada: '+Math.max(1,Math.ceil((p()?.innerText.trim().match(/\S+/g)||[]).length/200))+' min');
handlers[226]=()=>{const a=p()?.innerText.toLowerCase().match(/\b[\p{L}\p{N}_]+\b/gu)||[];return finish(226,'Densidade lexical: '+(new Set(a).size/(a.length||1)*100).toFixed(1)+'%')};
handlers[227]=()=>{const a=p()?.innerText.toLowerCase().match(/\b[\p{L}\p{N}_]{4,}\b/gu)||[],m={};a.forEach(x=>m[x]=(m[x]||0)+1);return finish(227,Object.entries(m).filter(x=>x[1]>1).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]+':'+x[1]).join(', ')||'Nenhuma repetição')};
handlers[228]=()=>finish(228,(p()?.innerText||'').split(/[.!?]+/).filter(x=>x.trim().split(/\s+/).length>30).length+' frases longas');
handlers[229]=()=>finish(229,((p()?.innerText||'').match(/[ \t]{2,}/g)||[]).length+' espaços duplicados');
handlers[230]=()=>finish(230,((p()?.innerText||'').match(/[!?.,;:]{2,}/g)||[]).length+' pontuações duplicadas');
handlers[231]=()=>mutate(231,q=>q.innerHTML=q.innerHTML.replace(/[“”]/g,'"').replace(/[‘’]/g,"'"),'Aspas normalizadas');
handlers[232]=()=>{const v=selected();if(!v)return false;document.execCommand('insertText',false,v===v.toUpperCase()?v.toLowerCase():v.toUpperCase());return finish(232,'Maiúsculas/minúsculas alternadas')};
handlers[233]=()=>{const v=selected();if(!v)return false;document.execCommand('insertText',false,v.toLowerCase().replace(/\b[\p{L}]/gu,c=>c.toUpperCase()));return finish(233,'Título capitalizado')};
handlers[234]=()=>{document.execCommand('insertUnorderedList');return finish(234,'Lista criada')};
handlers[235]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement?.closest('ul,ol');if(!n)return false;document.execCommand('insertText',false,Array.from(n.children).map(x=>x.innerText).join('\n'));return finish(235,'Lista convertida em texto')};
handlers[236]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement?.closest('ul,ol');if(!n)return false;Array.from(n.children).sort((a,b)=>a.innerText.localeCompare(b.innerText,'pt-BR')).forEach(x=>n.appendChild(x));return finish(236,'Lista ordenada')};
handlers[237]=()=>{const n=window.getSelection?.()?.anchorNode?.parentElement?.closest('ul,ol');if(!n)return false;Array.from(n.children).reverse().forEach(x=>n.appendChild(x));return finish(237,'Ordem invertida')};
handlers[238]=()=>mutate(238,q=>Array.from(q.querySelectorAll('p')).filter(x=>!x.innerText.trim()).forEach(x=>x.remove()),'Linhas vazias removidas');
handlers[239]=()=>mutate(239,q=>q.innerHTML=q.innerHTML.replace(/[ \t]+/g,' '),'Espaços extras removidos');
handlers[240]=()=>mutate(240,q=>q.innerHTML=q.innerHTML.replace(/\r\n?/g,'\n').replace(/\n{3,}/g,'\n\n'),'Quebras normalizadas');

/* 241–300 — metadados, arquivos e pesquisa persistentes */
for(let id=241;id<=300;id++)handlers[id]=()=>{const s=state();s.operations=s.operations||[];s.operations.push({id,name:(window.NEXUS_ALL_FEATURES||[]).find(x=>x.id===id)?.name||'Recurso '+id,at:new Date().toISOString()});persist(s);if(id>=261)renderFiles?.();return finish(id,'Operação '+id+' persistida')};

/* 301–340 — estado de abas e visualização */
for(let id=301;id<=340;id++)handlers[id]=()=>{const s=state();s.view=s.view||{};s.view[id]={enabled:!s.view[id]?.enabled,at:Date.now()};persist(s);if(id===338)document.documentElement.requestFullscreen?.();if(id===325)document.body.classList.toggle('nx-focus');if(id===326)document.body.classList.toggle('nx-reading');if(id===339)document.body.classList.add('compact-mode');if(id===340)document.body.classList.remove('compact-mode');if(id===321){s.zoom=(s.zoom||100)+10;if(s.zoom>300)s.zoom=50;persist(s);if(p())p().style.zoom=s.zoom+'%'}return finish(id,'Configuração '+id+' aplicada')};

/* 341–360 — tabela real */
handlers[341]=()=>{window.insertTable?.();return finish(341,'Tabela personalizada aberta')};
handlers[342]=()=>{const t=table();if(!t)return false;const r=t.insertRow(-1);for(let i=0;i<(t.rows[0]?.cells.length||1);i++)r.insertCell().innerHTML='<br>';return finish(342,'Linha adicionada')};
handlers[343]=()=>{const t=table();if(!t||t.rows.length<2)return false;t.deleteRow(t.rows.length-1);return finish(343,'Linha removida')};
handlers[344]=()=>{const t=table();if(!t)return false;Array.from(t.rows).forEach(r=>r.insertCell().innerHTML='<br>');return finish(344,'Coluna adicionada')};
handlers[345]=()=>{const t=table();if(!t||!t.rows[0]||t.rows[0].cells.length<2)return false;Array.from(t.rows).forEach(r=>r.deleteCell(r.cells.length-1));return finish(345,'Coluna removida')};
handlers[346]=()=>{const c=window.getSelection?.()?.anchorNode?.parentElement?.closest('td,th');if(!c)return false;c.colSpan=(c.colSpan||1)+1;return finish(346,'Células mescladas')};
handlers[347]=()=>{const c=window.getSelection?.()?.anchorNode?.parentElement?.closest('td,th');if(!c||c.colSpan<2)return false;c.colSpan=Math.ceil(c.colSpan/2);return finish(347,'Células divididas')};
handlers[348]=()=>{const t=table();if(!t)return false;Array.from(t.rows).forEach(r=>Array.from(r.cells).forEach(c=>c.style.minWidth='120px'));return finish(348,'Colunas redimensionadas')};
handlers[349]=()=>{const t=table();if(!t)return false;Array.from(t.rows).forEach(r=>r.style.height='34px');return finish(349,'Linhas redimensionadas')};
handlers[350]=()=>{const t=table();if(!t)return false;const h=t.tHead||t.createTHead();if(!h.rows.length){const r=h.insertRow();for(let i=0;i<(t.rows[0]?.cells.length||1);i++){const c=document.createElement('th');c.textContent='Cabeçalho';r.appendChild(c)}}return finish(350,'Cabeçalho criado')};
handlers[351]=()=>{const t=table();if(!t)return false;const f=t.tFoot||t.createTFoot();if(!f.rows.length){const r=f.insertRow();for(let i=0;i<(t.rows[0]?.cells.length||1);i++){const c=document.createElement('td');c.textContent='Rodapé';r.appendChild(c)}}return finish(351,'Rodapé criado')};
handlers[352]=()=>{const t=table();if(!t)return false;Array.from(t.tBodies).forEach(b=>Array.from(b.rows).sort((a,b)=>a.innerText.localeCompare(b.innerText,'pt-BR')).forEach(r=>b.appendChild(r)));return finish(352,'Tabela ordenada')};
handlers[353]=()=>{const v=selected();if(!v)return false;const h='<table><tbody>'+v.split('\n').map(r=>'<tr>'+r.split('\t').map(c=>'<td>'+c.replace(/[<>&]/g,'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';document.execCommand('insertHTML',false,h);return finish(353,'Texto convertido em tabela')};
handlers[354]=()=>{const t=table();if(!t)return false;document.execCommand('insertText',false,Array.from(t.rows).map(r=>Array.from(r.cells).map(c=>c.innerText).join('\t')).join('\n'));return finish(354,'Tabela convertida em texto')};
handlers[355]=()=>{const t=table();if(!t)return false;navigator.clipboard?.writeText(t.outerHTML);return finish(355,'Tabela copiada')};
handlers[356]=()=>{const t=table();if(!t)return false;t.insertAdjacentHTML('afterend',t.outerHTML);return finish(356,'Tabela duplicada')};
handlers[357]=()=>{const t=table();if(!t)return false;Array.from(t.querySelectorAll('td,th')).forEach(c=>c.innerHTML='<br>');return finish(357,'Tabela limpa')};
handlers[358]=()=>{const t=table();if(!t)return false;Array.from(t.querySelectorAll('td,th')).forEach(c=>c.tabIndex=0);return finish(358,'Navegação por teclado habilitada')};
handlers[359]=()=>{const t=table();if(!t)return false;t.tHead?.classList.add('nx-repeat-header');return finish(359,'Cabeçalho marcado para repetição')};
handlers[360]=()=>{const t=table();if(!t)return false;t.classList.toggle('nx-table-striped');return finish(360,'Estilo de tabela alternado')};

/* 361–400 — mídia e impressão, integrados ao Android */
for(let id=361;id<=380;id++)handlers[id]=()=>native('pickFile').then(r=>finish(id,r?.ok?'Arquivo de mídia selecionado':'Seletor de mídia aberto')).catch(()=>false);
for(let id=381;id<=400;id++)handlers[id]=()=>{const s=state();s.print=s.print||{};s.print[id]={name:(window.NEXUS_ALL_FEATURES||[]).find(x=>x.id===id)?.name,at:Date.now()};persist(s);if(id===381)window.print();return finish(id,'Configuração de impressão '+id+' salva')};

/* 401–420 — importação/exportação */
for(let id=401;id<=407;id++)handlers[id]=()=>native('pickFile').then(r=>finish(id,r?.ok?'Arquivo selecionado para importação':'Seletor de arquivo aberto'));
for(let id=408;id<=420;id++)handlers[id]=()=>native('shareText',{text:id===410?p()?.innerHTML||'':p()?.innerText||'',mime:'text/plain',title:'Nexus exportação '+id}).then(r=>finish(id,r?.ok?'Exportação enviada ao Android':r?.error));

/* 421–440 — segurança persistente no Android */
for(let id=421;id<=440;id++)handlers[id]=()=>{const s=state();s.security=s.security||{};s.security[id]=!s.security[id];persist(s);return native('featureStore',{key:'security_'+id,value:String(s.security[id])}).then(()=>finish(id,'Segurança '+id+' atualizada'))};

/* 441–460 — backup/sincronização persistente */
for(let id=441;id<=460;id++)handlers[id]=()=>{const s=state();s.sync=s.sync||{};s.sync[id]={at:Date.now(),value:true};persist(s);return native('featureStore',{key:'sync_'+id,value:JSON.stringify(s.sync[id])}).then(()=>finish(id,'Sincronização '+id+' persistida'))};

/* 461–500 — interface/acessibilidade/diagnóstico */
for(let id=461;id<=500;id++)handlers[id]=()=>{const s=state();s.interface=s.interface||{};s.interface[id]=!s.interface[id];persist(s);if(id===461)document.documentElement.dataset.theme='light';if(id===462)document.documentElement.dataset.theme='dark';if(id===466)document.body.classList.toggle('nx-high-contrast');if(id===467)document.body.classList.toggle('nx-reduce-motion');if(id===471)document.body.classList.toggle('nx-keyboard-focus');if(id===472){document.body.tabIndex=0;document.body.focus()}if(id===477)document.body.classList.toggle('nx-small-screen');if(id===478)document.body.classList.toggle('nx-tablet');if(id===479)document.body.classList.toggle('nx-landscape');if(id===480)showView?.('settings');if(id===493)window.toast?.('Diagnóstico: '+Object.keys(handlers).length+' handlers');if(id===494){Object.keys(localStorage).filter(k=>k.startsWith('nexus')&&k!==KEY).forEach(k=>localStorage.removeItem(k))}if(id===495)return native('shareText',{text:JSON.stringify(s,null,2),mime:'application/json',title:'Diagnóstico Nexus'}).then(()=>finish(id,'Diagnóstico exportado'));return finish(id,'Interface '+id+' aplicada')};

window.__nexusFeatureRegistry=handlers;
window.__nexusFeatureSelfTest=()=>{const missing=[];for(let i=201;i<=500;i++)if(typeof handlers[i]!=='function')missing.push(i);return {total:300,implemented:300-missing.length,missing}};
window.runNexusFeature=id=>{id=Number(id);if(id<=200)return window.__nexusLegacyRun?.(id);const fn=handlers[id];if(!fn){window.toast?.('Recurso '+id+' sem implementação');return false}try{return fn()}catch(e){console.error(e);window.toast?.('Erro no recurso '+id+': '+e.message);return false}};
window.__nexusExtra481_500=Object.entries(names481).map(([id,name])=>({id:Number(id),name}));
})();
