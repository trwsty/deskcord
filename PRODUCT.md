# Deskcord

<!-- impeccable:product-schema 1 -->

## Platform
web

## Purpose and users
Modificação do Discord desktop para quem quer um cliente mais leve e personalizável. Prioridade: reduzir trabalho visual e reprodução automática, com resultados de memória a medir no Discord real.

## Capabilities and constraints
- Instalação por cima do Discord, como o Vencord. Primeiro alvo: Windows.
- Três abas nas configurações: Deskcord, Plugins e Themes.
- Modo batata reversível. Não alterar voz, notificações, autenticação ou preferências sincronizadas da conta.
- Nenhum plugin opcional pré-instalado. A aba Plugins oferece catálogo por origem e categoria, autoria e descrições em português.
- Plugins são baixados sob demanda, com dependências e integridade conferida, e aplicados após reinício. Desativar preserva os arquivos; remover libera os pacotes sem uso por outros plugins.
- Origens previstas: Vencord, BetterDiscord, Equicord, Universais e Deskcord. Outros formatos exigem adaptação; não afirmar compatibilidade universal.
- Temas CSS locais com nome, autor, descrição, ativação e Reload.
- Badges e pagamentos ficam para uma etapa posterior.

## Brand commitments
Nome Deskcord. Interface limpa, integrada às configurações nativas do Discord, sem decoração ou animação desnecessária. Português brasileiro.

## Stack
Base derivada do Vencord em TypeScript, usando o React já carregado pelo Discord. Preservar licença GPL-3.0-or-later e atribuições. Não carregar outro React no cliente.

## Verification
Build, tipos, testes de temas, plugins/pacotes e instalador em diretórios temporários e interface em navegador. Integração dos plugins e ganho de memória exigem uma instalação real do Discord; não há benchmark verificado nesta etapa. Downloads públicos dependem da publicação dos pacotes em um repositório HTTPS; esse serviço ainda não foi configurado.
