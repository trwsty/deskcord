# Plugins sob demanda

## O que foi implementado

O cliente inclui somente metadados: nome, autor, descrição em português, origem, categoria, dependências, tamanho e SHA-256 autorizado. A revisão Vencord usada é `d07030c0968e31e41caa0c35fda0ef8ae63a079e`.

O catálogo lista os 168 plugins públicos dessa revisão. 155 geram pacotes instaláveis experimentais para desktop. Os outros 13 são identificados como destinados a outro ambiente ou precisando de adaptação; não são apresentados como funcionando. Os módulos internos ficam ocultos e são baixados apenas como dependências, exceto os três módulos mínimos que já vêm no núcleo.

BetterDiscord, Equicord, Universais e Deskcord têm filtros próprios, inicialmente vazios. Não existe promessa de que um plugin de qualquer cliente funcione sem adaptação. Vencord usa plugins compilados e patches; BetterDiscord usa contratos como `BdApi`, `start` e `stop`: [documentação Vencord](https://docs.vencord.dev/installing/custom-plugins/), [documentação BetterDiscord](https://docs.betterdiscord.app/plugins/introduction/quick-start).

## Fluxo de instalação

1. A pessoa consulta o catálogo sem baixar código opcional.
2. Ao escolher **Baixar e ativar**, o processo principal resolve a árvore de dependências.
3. Baixa sequencialmente apenas pacotes ausentes, via HTTPS público. Não envia cookies ou credenciais do Discord. Redirecionamentos também passam pela validação de destino e DNS.
4. Verifica tamanho, SHA-256, identificador e revisão contra o catálogo que veio no cliente. O servidor não pode autorizar código novo alterando um manifesto remoto.
5. Salva os pacotes em `%APPDATA%\Deskcord\plugins`. Uma instalação interrompida não ativa um conjunto parcial.
6. A pessoa reinicia o Discord. Os pacotes são verificados novamente, registrados antes da inicialização do gerenciador e aplicados antes de os módulos do Discord carregarem. Módulos nativos também só são preparados na inicialização.
7. Desativar preserva o download. Remover apaga pacotes sem dependentes instalados. Mudanças em código já carregado exigem reinício para encerrar seus efeitos.

Os pacotes compartilham as APIs e stores do núcleo. Os módulos nativos compartilham o store do processo principal para evitar registrar handlers IPC duplicados. Falhas na abertura da pasta de plugins não devem impedir o núcleo de iniciar. O argumento `--deskcord-safe` pula plugins opcionais; após corrigir a seleção, feche e abra normalmente pelo atalho.

Há limites de 8 MB por pacote, 128 módulos e 128 MB selecionados. Operações são serializadas. IPC de gerenciamento aceita somente o frame principal das origens Discord previstas. SHA-256 confirma os bytes aprovados pelo cliente; não equivale a auditoria ou sandbox de plugins. Código nativo tem os privilégios do processo principal.

## Preparar a distribuição

```sh
pnpm build:catalog
pnpm test
pnpm test:ui
pnpm package:deskcord
```

São gerados três arquivos separados:

- `Deskcord-0.4.0-windows.zip`: cliente e instalador, sem fontes ou pacotes opcionais pré-baixados.
- `Deskcord-plugin-repository-0.4.0.zip`: pacotes, catálogo e avisos para o operador hospedar.
- `Deskcord-source-0.4.0.zip`: fontes correspondentes, dependências declaradas, scripts e licenças. Deve permanecer disponível junto do download dos binários conforme a modalidade de distribuição GPL escolhida.

Publique os arquivos `.json` dos pacotes em uma pasta HTTPS acessível. Por exemplo, uma pasta em GitHub Pages, um servidor próprio ou assets de um GitHub Release. Não basta publicar apenas o ZIP: o cliente baixa o arquivo individual indicado no catálogo.

Configure a URL da pasta em `src/deskcord/plugins/distribution.json` **antes do build público**, ou use `DESKCORD_PLUGIN_REPOSITORY` para testes. A opção avançada da aba Plugins também permite salvar o endereço localmente. URLs HTTP, IPs literais, destinos privados e URLs com credenciais são recusados. Alterar essa URL não muda os hashes autorizados.

O cliente 0.4.0 usa por padrão `https://raw.githubusercontent.com/trwsty/deskcord/main/plugin-packages/d07030c0968e31e41caa0c35fda0ef8ae63a079e/`. Os pacotes individuais devem estar publicados nesse caminho; um link para o diretório de fontes do Vencord não os substitui. Preferências de repositório já salvas no perfil continuam prevalecendo sobre o padrão: atualize-as na aba Plugins, se necessário. `pnpm prepare:github`, executado depois do empacotamento, cria uma cópia separada com fontes, pacotes e guias de publicação.

## Validação e limites

Testes cobrem download seletivo, dependências compartilhadas, rollback de downloads, integridade, corrupção em disco, remoção e serialização. Um pacote renderer e um nativo são executados em hosts de teste mínimos para verificar o contrato de registro e compartilhamento do store. Os testes de navegador usam a interface real com a ponte simulada.

A compilação dos 155 pacotes não comprova o funcionamento deles no Discord real. Patches e integrações externas podem quebrar com atualizações. Os plugins que usam recursos externos continuam sujeitos à CSP original do Discord. O catálogo e as ações de instalação estão em português. A engrenagem abre as opções padrão expostas pelo plugin após a instalação e reinício: switches, seletores, texto, números e sliders. Opções com interface personalizada ou tipos ainda não suportados são identificadas como não integradas. Os textos internos dessas opções continuam os originais do autor.

As adaptações nativas desta revisão limitam redirecionamentos de OpenInApp a hosts específicos e retornam somente os bytes da gravação em VoiceMessages, com validação de caminho e tamanho. Os avisos e autores originais foram preservados.
