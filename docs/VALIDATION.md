# Validação do Deskcord

## Verificações locais

Resultado desta entrega: testes de domínio/instalador e interface passaram; os arquivos de teste de instalação foram restaurados byte por byte. O carregador também reuniu o CSS público do ClearVision V7 e seus imports, sem instalar ou distribuir esse tema. Isso não comprova sua aparência no Discord atual.

A instalação real encontrada nesta máquina usa Vencord (`app.asar` injeta `%APPDATA%\Vencord\dist\patcher.js`) e estava aberta. Ela foi preservada; não houve teste de substituição nem medição real de RAM.

`pnpm test:deskcord`: metadados de tema, limites de arquivo/importação, bloqueio de caminhos/hosts indevidos, reversibilidade de configurações e ciclo de instalação/reinstalação/remoção em ASARs temporários. Não altera o Discord instalado.

Os testes de plugins também verificam o catálogo, os hashes de todos os pacotes disponíveis, download seletivo, dependências compartilhadas, ativação após reinício, corrupção e rollback de instalação. O navegador verifica filtros por origem, busca, autoria, download/ativação, desativação/remoção e erro de download com uma ponte simulada.

`pnpm test:ts`, `pnpm lint`, `pnpm fmt:check`, `pnpm build --dev`: tipos, análise estática, formatação e build.

`pnpm verify:bundle`: inspeciona os source maps e exige exatamente os três módulos internos permitidos, sem plugins nativos ou código de alteração da CSP no patcher.

`pnpm test:ui`: as mesmas abas React em um host de teste local, com ponte nativa simulada. Verifica teclado, modo batata, Reload, temas, falha de leitura, estado vazio e layout estreito. Isso não comprova compatibilidade com o renderer do Discord.

## Validação no Discord real (pendente)

Plugins: após publicar/configurar o repositório, testar cada pacote no Discord real. Confirmar inicialização de patches, handlers nativos, encerramento após desativação e ausência de regressões no modo batata. A compilação do catálogo não substitui essa verificação.

1. Fechar Discord pela bandeja. Instalar com `pnpm inject`. Não instalar junto de Vencord/BetterDiscord.
2. Abrir configurações e verificar Deskcord, Plugins e Themes. Em compatibilidade, confirmar 6/6 controles de mídia.
3. Com temas desligados, comparar o mesmo canal sem e com modo batata; conferir GIFs, emojis, stickers, anexos e embeds. Verificar chamadas, stream e notificações.
4. Na pasta de temas, copiar CSS confiável com `@name` e `@author`. Usar Reload, ativar/desativar, editar arquivo e repetir Reload. Remover o arquivo e repetir.
5. Ativar modo batata com tema ativo, confirmar pausa; desligar e confirmar restauração. Reiniciar Discord e verificar persistência.
6. Comparar memória privada e CPU da árvore inteira de processos do Discord após aquecimento, em repouso, navegação e chamada. Fazer pelo menos três repetições equivalentes. Registrar versão do Discord, Windows, máquina e plugins/temas. Não usar apenas o heap JS como RAM total.
7. Desinstalar e confirmar restauração e preservação dos temas. Testar uma atualização real do host antes de afirmar persistência entre versões.

## Limitações conhecidas

- O Discord pode alterar módulos internos e quebrar os hooks e as abas. O contador informa os controles de mídia conectados; CSS reduz efeitos independentemente deles.
- Janelas que usam o sandbox do Electron são deixadas sem injeção; o Deskcord não desliga esse isolamento para carregar o mod.
- O modo batata não elimina o custo base do Electron nem força coleta de lixo. Sem ganho percentual prometido.
- CSS normal e imports HTTPS dos hosts documentados são aceitos. Imports `layer`/`supports` e arquivos locais auxiliares precisam ser reunidos em um CSS único. Assets externos continuam sujeitos à CSP original do Discord. Não há compatibilidade universal de temas.
- Preview de navegador não substitui teste dentro do Discord. O EXE gráfico WPF embute Node oficial e não exige instalação desse runtime; ainda não tem assinatura digital.
- O build mantém módulos-fonte do Vencord para rastreabilidade; o perfil exclui todos os plugins opcionais do bundle.

## Interface compacta 0.2.1

Referências fornecidas pelo usuário: configurações do Vencord, grade de plugins, temas e atualizador. Foram adaptadas as três abas existentes; recursos sem serviço configurado não foram copiados como controles inativos. O teste de navegador verifica grade de duas colunas, uma coluna a 390 px, switches com download na primeira ativação, aviso padrão de reinício, informações/autoria, opções de plugin, Esc e retorno do foco. Opções de interface personalizada continuam pendentes de adaptação.

## Instalador Windows 0.3.0

- EXE x64 WPF/.NET Framework, compilado com o compilador do Windows. Runtime Node 24 LTS oficial embutido, checksum fixado em `installer/windows/node-runtime.json`. Recursos extraídos em diretório temporário exclusivo e verificados por SHA-256 antes da execução.
- Instalação, reinstalação com reparo de payload, migração do carregador padrão do Vencord, remoção e atualização simulada do host cobertas por testes temporários. A restauração é comparada byte por byte. Pastas desconhecidas e links são recusados.
- O executável abriu e expôs a janela `Deskcord • Instalador`. Captura interativa pelo controle de desktop falhou após recuperação com `FrameArrived timed out` / `window capture timed out`. A renderização nativa do XAML foi inspecionada separadamente; os cliques no EXE não foram verificados de ponta a ponta por automação.
- Instalação real em Discord Windows 1.0.9267 realizada pelo mesmo worker de implantação, com backup do carregador anterior do Vencord. Discord fechado e reaberto pelo executável normal. O diagnóstico opt-in retornou `renderer: true`, `native: true`, `deskcord: true`. Isso confirma carregamento do núcleo, sem comprovar todos os plugins, controles de mídia ou o conteúdo visual de cada aba.
- `DESKCORD_DIAGNOSTICS=1` emite somente disponibilidade dos componentes Deskcord no console do processo principal, sem ler identificadores, mensagens ou tokens. Não precisa estar definido para uso normal.
- Persistência após uma atualização real do Discord, assinatura digital e distribuição HTTPS dos plugins continuam pendentes.

## Correção do instalador 0.3.1

Corrigidos os acessos ao campo `Log`: o XAML declara `TextBox`, e o resultado/erro tentava usar `TextBlock`. Corrigida também a conversão de `import.meta.url` ao empacotar o worker CommonJS; sem ela, uma dependência ASAR falhava antes de responder à janela.

`pnpm test:installer` carrega o XAML e os handlers reais do EXE em um dispatcher WPF, extrai os recursos embutidos e usa o Node distribuído no instalador. Em uma pasta temporária com um Discord fictício, executa instalação, reinstalação, erro por backup ausente e desinstalação. Confere a mensagem apresentada e compara o ASAR restaurado byte por byte. Não descobre, encerra ou abre o Discord real. O empacotamento executa esse teste antes de produzir os ZIPs.

## Estado dos downloads 0.3.2

Sem repositório publicado/configurado, o catálogo informa explicitamente que instalações estão indisponíveis. Tentar ativar mostra o motivo no próprio cartão, sem iniciar download ou indicar atividade indefinida. Plugins já instalados permanecem utilizáveis. O teste de navegador cobre a tentativa sem endereço, ausência de downloads, switch desligado e layout de 390 px, além do fluxo com um repositório simulado configurado. Isso corrige o feedback da interface; não substitui a publicação dos pacotes HTTPS, que continua pendente. A pasta `src/plugins` do Vencord contém fontes, não os pacotes JSON compilados e verificados usados pelo Deskcord.

## Instalador e distribuição 0.4.0

Instalador WPF redesenhado em uma coluna, com tamanhos padrão e mínimo renderizados para inspeção, controles escuros, rolagem e barra de título nativa escura quando suportada. O status de falha deixa de ser sobrescrito pela atualização do estado da instalação. Os handlers nativos continuam cobertos pelo teste com ASAR temporário, sem tocar no Discord do usuário.

O padrão de download foi configurado para o repositório público `trwsty/deskcord`, na pasta de pacotes da revisão correspondente. Publicar o repositório e testar o transporte HTTPS são etapas separadas do build; compilar não comprova disponibilidade da hospedagem ou compatibilidade de todos os plugins no Discord.

## Correção do crash React 0.4.1

Reproduzido no Discord real 1.0.9267, sem plugins opcionais, com erro React 311. A instrumentação de desempenho acrescentava `useReducer`/`useEffect` via `useSettings` ao hook de mídia do host depois da montagem dos componentes, alterando a ordem de hooks. O wrapper agora chama somente os hooks originais do Discord e consulta a preferência do modo batata sem adicionar hooks.

O teste de navegador monta um componente React real antes da instrumentação e confirma preservação de estado ao aplicar o wrapper, ativar/desativar e restaurar os métodos. Um teste unitário cobre contexto, chamadas originais e restauração. No Discord real foram verificados recarga, abertura da aba Deskcord e duas alternâncias do modo batata sem erro ou tela de queda, preservando a preferência original. Os ajustes de mídia são observados no próximo render normal do componente; mudar de canal atualiza a visualização. Não há atualização de preferências da conta para forçar esse refresh.
