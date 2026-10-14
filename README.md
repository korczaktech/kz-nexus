# Korczak Nexus — Website

O Korczak Nexus será mantido **somente como aplicação Web**, acessível pelo navegador. O repositório preserva a interface Web, a API/backend, os testes e a publicação via GitHub Pages.

## Escopo atual

- **Website:** aplicação React + TypeScript + Vite, publicada pelo workflow `.github/workflows/pages.yml`.
- **Backend/API:** serviço FastAPI e integração com MongoDB.
- **PWA:** recursos de instalação da própria aplicação Web podem existir no navegador, mas não haverá aplicativos nativos distribuídos.
- **Sem aplicativos instaláveis nativos:** o código-fonte e os workflows de Desktop (Electron), Android/APK e iOS foram removidos. Não serão gerados novos pacotes `.exe`, `.deb`, `.dmg`, AppImage ou `.apk`.

## Estado e validação

A existência de código ou a aprovação de um workflow não comprova que todos os fluxos estejam concluídos. A interface Web, a API em produção, a sincronização e os fluxos críticos precisam continuar sendo validados por testes automatizados e manuais.

## Estrutura principal

- `frontend/` — aplicação Web React + TypeScript + Vite.
- `backend/` — API FastAPI, serviços, repositórios, modelos e persistência.
- `api/` — documentação e contratos da API.
- `docs/` e `documentacao/` — documentação técnica e fases do projeto.
- `scripts/` e `testes/` — ferramentas e testes.
- `.github/workflows/pages.yml` — validação e publicação do Website.
- Outros workflows mantêm a validação do backend, segurança, desempenho e saúde do serviço; não geram instaladores nativos.

## Publicação

O pipeline Web está em `.github/workflows/pages.yml`. Consulte [as execuções do GitHub Actions](https://github.com/korczaktech/kz-nexus/actions) para verificar o resultado do deploy mais recente.

**Política do projeto:** o Nexus é um produto Web. Não desenvolver, empacotar nem publicar aplicativos Desktop ou APK neste repositório.
