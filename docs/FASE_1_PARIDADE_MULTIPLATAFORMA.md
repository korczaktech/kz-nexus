# Fase 1 — Paridade Funcional Multiplataforma

## Objetivo

Garantir que Android, iOS e Web Desktop exponham o mesmo conjunto de funcionalidades do Korczak Nexus, usando a implementação adequada a cada plataforma.

## Base

A implementação foi iniciada sobre o commit `409c35efb91c8d440ec752de424429cafd8ccbcc`, o estado mais recente informado antes desta fase.

## Checklist concluída

- [x] Autenticação: login, cadastro, recuperação e sessão.
- [x] Perfil e configurações.
- [x] Documentos.
- [x] Pastas.
- [x] Favoritos.
- [x] Recentes.
- [x] Lixeira.
- [x] Histórico.
- [x] Versões.
- [x] Editor.
- [x] Pesquisa rápida.
- [x] Pesquisa avançada.
- [x] Usuários.
- [x] Grupos.
- [x] Permissões documentais.
- [x] Permissões de pastas.
- [x] Auditoria.
- [x] Notificações.
- [x] NexusAPI.
- [x] Feedback.
- [x] Atualizações.
- [x] Administração no Android, com acesso real aos endpoints existentes.
- [x] iOS apontando para a aplicação Nexus atual, em vez da URL legada.
- [x] Android mantendo seus bridges nativos sem remover recursos já existentes.
- [x] Web mantendo a API central e os recursos administrativos já existentes.

## Implementação por plataforma

### Web Desktop

A aplicação Web continua sendo a superfície completa de gestão documental e administração. O centro de atualizações consulta a publicação oficial do repositório e permite acessar a release publicada.

### iOS

O cliente nativo continua sendo um wrapper do Nexus Web, mas agora carrega a aplicação atual em:

`https://korczaktech.github.io/kz-nexus/`

Isso garante que login, editor, documentos, pastas, pesquisa, administração, permissões, auditoria, NexusAPI e feedback recebam a mesma evolução da aplicação Web.

Os bridges nativos de seleção de arquivos e compartilhamento permanecem disponíveis para as fases específicas de armazenamento/nativo.

### Android

O Android já possuía interface e bridges nativos próprios. Foi adicionado um Centro de Gestão de Paridade com:

- Usuários: listagem, criação, edição, ativação/desativação.
- Grupos: listagem, criação, inclusão de membros e exclusão.
- Permissões: leitura e alteração de permissões documentais.
- Auditoria: consulta dos eventos registrados pela API.
- Pesquisa avançada: termo, pasta, tag e status.

Todas as operações usam o bridge `api`, que mantém a sessão Android e chama a NexusAPI real.

## Limites desta fase

A paridade desta fase significa **paridade funcional do produto**. Não significa que os três sistemas terão o mesmo acesso físico ao sistema operacional.

Filesystem, armazenamento offline, sincronização, notificações de background, compartilhamento nativo avançado e atualização específica de cada sistema operacional pertencem à Fase 2/3 e serão implementados com APIs próprias de Android, iOS e Web.

## Critério de conclusão

A Fase 1 só é considerada concluída quando:

1. as funcionalidades comuns estão presentes nas três superfícies;
2. o Android não possui mais os módulos administrativos fundamentais ausentes da Web;
3. o iOS carrega a aplicação Nexus atual;
4. NexusAPI e feedback estão identificados nos clientes;
5. atualização está exposta na Web e no Android;
6. nenhuma funcionalidade existente foi removida para obter a paridade.

