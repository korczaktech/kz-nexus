# KORCZAK NEXUS — MOTOR PRÓPRIO DE EDIÇÃO
## FASE 0 — FUNDAÇÃO E ARQUITETURA

**Projeto:** Korczak Nexus  
**Componente:** Nexus Document Engine (nome técnico provisório)  
**Fase:** 0 — definição arquitetural  
**Estado:** especificação inicial registrada; implementação do motor ainda não iniciada  
**Escopo deste documento:** arquitetura do motor de edição e sua integração ao Nexus e ao Korczak HUB  
**Regra de implantação:** alterações diretamente em `main`, sem criar uma API exclusiva para o motor nesta fase

---

## 1. Objetivo

Construir um motor de edição próprio para o Korczak Nexus. O motor deverá controlar a representação do documento, operações de edição, formatação, layout e paginação, sem depender de páginas HTML importadas como modelo canônico do documento.

O Nexus continuará sendo a aplicação que oferece a experiência de uso. O motor será um módulo de domínio interno, com fronteiras explícitas, para que possa evoluir e eventualmente ser reutilizado por Web, Desktop, Android e iOS.

O projeto não pretende reproduzir todas as capacidades do Microsoft Word na primeira entrega. A estratégia é desenvolver uma fundação própria e extensível, validada em etapas, sem prometer compatibilidade avançada antes de ela ser testada.

## 2. Decisão arquitetural principal

**Começar no repositório existente do Korczak Nexus, como módulo interno independente. Não criar um novo serviço HTTP nem uma segunda API para edição.**

Motivos:
- evita nova infraestrutura, autenticação de serviço para serviço, deploy, observabilidade e custos operacionais;
- permite testar o motor junto com o editor e o CI já existentes;
- mantém a edição responsiva e local, sem round-trip de rede por tecla, seleção ou cálculo de layout;
- reduz o risco de criar uma biblioteca externa antes de estabilizar seu contrato;
- preserva a opção de extrair o núcleo para pacote ou repositório independente quando houver consumidores reais e uma interface estável.

Separação de código não exige separação de repositório nem de processo. A extração futura será uma decisão baseada em necessidade comprovada, não um pré-requisito.

## 3. Arquitetura lógica

```text
Clientes do Korczak Nexus
  ├─ Web / PWA
  ├─ Desktop (Electron)
  ├─ Android
  └─ iOS
        │
        ▼
Interface e adaptadores de plataforma do Nexus
        │
        ▼
Nexus Document Engine (módulo interno)
  ├─ Modelo canônico de documento
  ├─ Comandos e transações de edição
  ├─ Seleção e posições
  ├─ Histórico undo/redo
  ├─ Layout e paginação
  ├─ Contratos de componentes incorporados
  └─ Importadores / exportadores por formato
        │
        ├────────► API existente do Nexus
        │           documentos, versões, identidade,
        │           permissões, auditoria e persistência
        │
        └────────► adaptador de integração do Korczak HUB
                    planilhas, formulários, chats e outros módulos
```

Este é um diagrama lógico, não uma declaração de que todos os módulos já existem.

## 4. Responsabilidades por camada

### 4.1 Modelo canônico

Representa semanticamente o documento, independentemente da interface de apresentação. O modelo inicial deverá suportar:
- documento e metadados;
- parágrafos e trechos de texto;
- marcas de formatação e estilos;
- títulos e listas;
- tabelas, linhas e células;
- imagens e recursos anexos por referência;
- quebras de página e propriedades de seção;
- cabeçalho e rodapé como estruturas documentais;
- componentes incorporados por identificador e configuração tipada.

O modelo não deverá usar HTML renderizado como fonte de verdade. HTML pode ser usado como adaptador de entrada/saída ou camada de apresentação, nunca como contrato interno definitivo.

### 4.2 Comandos e transações

Alterações no documento deverão passar por comandos tipados e validáveis, por exemplo inserir texto, dividir parágrafo, aplicar marca, inserir tabela, alterar célula ou inserir componente. O comando produz uma alteração previsível no modelo e pode ser testado sem navegador.

O contrato deverá permitir:
- validação de posição e intervalo;
- agrupamento de alterações relacionadas em transações;
- undo/redo;
- identificação de alterações pendentes;
- testes determinísticos;
- preparação futura para colaboração e sincronização sem implementar CRDT/OT prematuramente.

### 4.3 Layout e paginação

O layout será uma camada distinta do modelo e da interface. Receberá o documento e as métricas necessárias e produzirá uma representação de layout: blocos, linhas, limites, páginas e quebras.

Princípios:
- dimensões e margens explícitas por seção;
- paginação recalculada após alterações relevantes;
- regras determinísticas para as mesmas entradas e métricas;
- layout não altera o conteúdo semântico;
- renderização visual não é confundida com persistência;
- testes de regressão com documentos de referência;
- evitar páginas físicas aninhadas e margens duplicadas provenientes de importadores.

A primeira versão não promete paridade tipográfica perfeita entre sistemas operacionais. Fontes disponíveis e diferenças de rasterização podem alterar métricas; isso deverá ser medido e documentado.

### 4.4 Adaptadores de plataforma

O núcleo não deve importar React, DOM, Electron, APIs nativas de Android/iOS ou objetos específicos de navegador. Adaptadores da aplicação fornecerão as capacidades de plataforma necessárias, como medição de texto, entrada, clipboard, fontes, armazenamento temporário e acessibilidade.

O frontend atual é React + TypeScript + Vite; o desktop usa Electron e existem projetos Capacitor/nativos. Portanto, a primeira implementação pode usar TypeScript para reduzir atrito com o cliente Web. A portabilidade real para clientes nativos será avaliada com um protótipo antes de assumir que a mesma implementação visual pode ser compartilhada sem adaptações.

A meta é compartilhar o núcleo de regras e modelo; cada plataforma pode ter um adaptador de entrada e apresentação adequado.

## 5. API e persistência: sem novo serviço

A API FastAPI já existente continua responsável pelas operações remotas que ela oferece. O motor não criará uma API própria para cada comando de edição.

Fluxo de salvamento previsto:
1. o usuário edita localmente no modelo do motor;
2. o editor acompanha estado sujo, salvando, salvo, conflito ou erro;
3. o adaptador de persistência utiliza os endpoints existentes de documentos e versões;
4. o salvamento inclui a versão-base conforme o contrato atual;
5. o servidor valida autorização e concorrência;
6. somente a confirmação do servidor permite declarar o conteúdo persistido como salvo;
7. em falha ou conflito, o rascunho local é preservado e o usuário recebe estado explícito.

A persistência do documento deverá evoluir para armazenar uma versão serializada do modelo canônico e metadados de formato/schema. Durante a migração, conteúdo legado deverá continuar sendo lido por adaptadores. A migração do formato persistido exige plano de compatibilidade, testes e possibilidade de recuperação; não deve ocorrer por substituição abrupta.

Não serão duplicados no motor: autenticação, autorização definitiva, propriedade, permissões, auditoria, versionamento remoto ou regras de segurança do servidor.

## 6. Componentes do Korczak HUB

O documento poderá conter componentes vivos, não apenas imagens ou HTML copiado. O motor definirá um contrato genérico de bloco incorporado, com:
- tipo e versão do componente;
- identificador estável;
- origem/provedor;
- referência ao recurso remoto;
- configuração de apresentação;
- capacidades solicitadas;
- estado de carregamento/erro/offline;
- política de atualização e indicação de última sincronização.

Exemplos de tipos futuros:
- planilha espelhada;
- formulário;
- chat ou conversa;
- gráfico ou painel;
- tarefa, registro ou outro recurso autorizado do HUB.

O motor hospeda o bloco e fornece seu contexto de posicionamento. O sistema de origem continua responsável pelos dados, regras de negócio e autorização. O contrato não deve armazenar credenciais nos documentos nem confiar em permissões declaradas pelo cliente.

### Interação

Um componente poderá declarar capacidades como visualizar, editar ou abrir no sistema de origem. A autorização real será consultada/validada pelos serviços existentes. O modo de interação deverá ser explícito; não se presume que todo componente possa ser editado dentro do documento.

### Espelhamento e sincronização

Uma planilha espelhada mantém referência à fonte, versão/snapshot conhecido e estado de atualização. Atualização visual, edição de origem e gravação de alterações são operações distintas. Conflitos devem ser expostos, nunca resolvidos por sobrescrita silenciosa.

Os detalhes dos contratos com o HUB serão especificados quando forem identificados os endpoints e sistemas de origem concretos. Não inventar endpoints ou declarar integrações existentes sem evidência.

## 7. Importação e exportação

Importadores e exportadores serão adaptadores do modelo canônico:
- texto/Markdown e conteúdo legado;
- HTML controlado;
- DOCX;
- PDF para exportação e, quando possível, importação textual.

DOCX não deve ser tratado como um conjunto de páginas HTML que se torna o documento interno. O importador deve mapear o conteúdo para o modelo canônico e preservar, quando suportado, estilos, seções, tabelas, imagens e quebras. O exportador reconstrói o arquivo a partir do modelo.

PDF é primordialmente um formato de apresentação; importar PDF editável é uma operação de reconstrução aproximada, não conversão sem perda. A UI deve informar limitações quando necessário.

A compatibilidade será medida por fixtures de teste e critérios por recurso, não por uma promessa genérica de fidelidade total.

## 8. Estrutura inicial proposta

Criar o módulo em `frontend/src/engine/`, sem mover ou reescrever o editor atual durante a fundação:

```text
frontend/src/engine/
  model/          tipos e schema do documento
  commands/       operações e transações
  selection/      posições e intervalos
  history/        undo/redo
  layout/         medidas, linhas e paginação
  components/     contrato de blocos incorporados
  formats/        contratos comuns de importação/exportação
  serialization/  codificação, versão do schema e migrações
  index.ts        API pública interna do motor
```

Testes próximos aos módulos ou em `frontend/src/engine/**/*.test.ts`, conforme o padrão do repositório. Essa estrutura é uma proposta inicial e pode ser refinada após verificar as convenções do código. Não criar arquivos de implementação vazios apenas para preencher a árvore.

## 9. Estratégia de migração

A migração será incremental e reversível:
1. registrar a arquitetura e os critérios;
2. implementar tipos e serialização mínima do modelo;
3. criar testes do modelo e comandos sem alterar a UI;
4. criar um protótipo de layout/paginação com fixtures determinísticas;
5. integrar uma fatia vertical pequena ao editor atual;
6. comparar comportamento e salvamento com o editor legado;
7. migrar formatação e blocos por etapas;
8. implementar importação/exportação com critérios de compatibilidade;
9. habilitar componentes do HUB quando os contratos de origem estiverem definidos;
10. remover caminhos legados apenas após testes de regressão e recuperação.

Cada etapa deve manter a aplicação existente utilizável. Não realizar uma reescrita total em um único commit.

## 10. Não objetivos da Fase 0

Esta fase não:
- implementa o motor;
- substitui o editor existente;
- cria outro backend ou API;
- altera endpoints atuais;
- declara integração pronta com o Korczak HUB;
- promete compatibilidade total com DOCX/Word;
- implementa colaboração em tempo real;
- altera a estrutura persistida em produção;
- declara o projeto testado em dispositivos reais.

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Escopo semelhante ao de um processador de texto completo | Entregas pequenas e suporte por recurso |
| Diferenças de métricas de fontes entre plataformas | Adaptadores, fixtures e tolerâncias documentadas |
| Quebra de documentos existentes | Adaptadores legados, migração versionada e testes de ida/volta |
| Perda de conteúdo em falha ou conflito | Rascunho local, versionamento remoto e confirmação explícita |
| Acoplamento do núcleo ao DOM | Regras e modelo sem dependências de UI |
| Integrações HUB inconsistentes | Contrato versionado por componente e autorização na origem |
| Crescimento prematuro da infraestrutura | Sem serviço/API nova até existir requisito comprovado |
| Alegar multiplataforma sem validar | Protótipo de portabilidade e matriz de testes por plataforma |

## 12. Critérios de aceite da Fase 0

- [x] Identidade correta do projeto: Korczak Nexus.
- [x] Decisão inicial: motor como módulo interno, sem API dedicada.
- [x] Separação documentada entre modelo, comandos, layout, interface e persistência.
- [x] Papel da API existente e da autoridade do backend documentado.
- [x] Contrato conceitual de componentes integráveis do Korczak HUB documentado.
- [x] Estratégia para importação/exportação e conteúdo legado definida.
- [x] Estratégia de migração incremental e reversível definida.
- [x] Riscos e não objetivos registrados.
- [ ] Arquitetura revisada contra todos os clientes e convenções reais do repositório.
- [ ] Escolha de tecnologia multiplataforma confirmada por protótipo.
- [ ] Contratos concretos dos serviços do Korczak HUB identificados.
- [ ] Plano de serialização/migração validado contra documentos existentes.

**Resultado honesto:** a especificação inicial da Fase 0 foi registrada. A fase de arquitetura ainda não deve ser declarada integralmente homologada até que os itens pendentes sejam verificados. Nenhum código de edição foi substituído por este documento.
