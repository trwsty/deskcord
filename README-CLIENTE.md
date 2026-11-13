# Deskcord

Mod do Discord desktop com modo batata e temas CSS locais. Fork do [Vencord](https://github.com/Vendicated/Vencord), sob GPL-3.0-or-later. Não é uma distribuição oficial do Vencord nem é afiliado ao Discord.

## Primeira versão

- **Deskcord:** modo batata reversível, visual Clássico compacto integrado, pausa opcional dos temas e diagnóstico dos controles de mídia.
- **Plugins:** catálogo com 168 plugins públicos do Vencord, descrições em português, autoria, origens e categorias. 155 pacotes experimentais preparados para download; outros indicam incompatibilidade ou necessidade de adaptação. Nenhum plugin opcional vem pré-instalado.
- **Themes:** abrir pasta, Reload, buscar por nome/autor e ativar/desativar CSS com metadados.
- Preferências e temas em `%APPDATA%\Deskcord`, separados do Vencord.
- Instalação reversível no Windows com backup do ASAR original.

O modo batata desliga reprodução automática de GIFs, emojis e stickers, recolhe mídias e embeds e reduz animações, sombras e desfoque. Os controles de mídia são overrides locais: não são enviados à conta. Ao desligar, o comportamento original volta. Isso não elimina o custo base do Electron nem comprova uma redução específica de RAM.

## Preparar e verificar

Requer Node.js 22+ e pnpm:

```sh
pnpm install --frozen-lockfile
pnpm build:catalog
pnpm test
pnpm preview:deskcord
```

O preview usa as abas reais com uma ponte de teste, sem conexão com o Discord. `pnpm test:ui` testa a interface em Brave, Chrome ou Edge; configure `BROWSER_PATH` se necessário. React instalado como dependência de desenvolvimento é usado somente nesse preview; o mod usa o React do Discord.

## Instalar e remover

Abra **Deskcord-Setup-0.7.0.exe**. O instalador gráfico seleciona o Discord padrão e permite escolher PTB, Canary ou uma pasta personalizada. Use **Instalar**, **Reinstalar / reparar** ou **Desinstalar**. Ele fecha os processos da instalação escolhida e abre o Discord ao concluir, se essa opção estiver marcada. Não exige Node instalado nem elevação de administrador nas instalações do usuário.

O carregador padrão do Vencord é reconhecido e substituído, com uma cópia em `resources\deskcord-vencord-backup.asar`. Outros modificadores são recusados. Configurações do Vencord não são importadas. Para desenvolvimento pela CLI, feche o Discord antes:

```sh
pnpm build --dev
pnpm install:list
pnpm inject
```

Para PTB/Canary: `pnpm inject --channel DiscordPTB` ou `pnpm inject --channel DiscordCanary`. Instalação personalizada: `pnpm inject --resources "C:\caminho\Discord\app-VERSAO\resources"`.

Abra o Discord e procure **Deskcord**, **Plugins** e **Themes** nas configurações. Em Compatibilidade, verifique se os seis controles de mídia foram conectados.

O instalador copia o build para `resources\Deskcord\<hash>` dentro da instalação do Discord, permitindo mover o instalador/projeto depois. Abrir o Discord pelo atalho normal carrega o Deskcord dentro do mesmo aplicativo. `_app.asar` contém o original: não o apague manualmente. Para remover e restaurar, use o EXE ou `pnpm uninject`. Temas e preferências ficam em `%APPDATA%\Deskcord` e são preservados. Se uma atualização retirar o mod, reinstale; a cópia automática entre versões foi testada com instalações temporárias e ainda precisa de uma atualização real do Discord.

Após gerar o catálogo e o build, `pnpm package:deskcord` gera em `release` o EXE autossuficiente e arquivos separados para cliente, pacotes de plugins e código-fonte correspondente. A partir de 0.5.0, o EXE usa apenas WPF/.NET Framework do Windows: não embute Node e não baixa um runtime durante a instalação. Recursos compactados são conferidos por SHA-256. O ZIP do cliente contém o EXE e a documentação, sem uma segunda cópia dos arquivos do núcleo ou uma CLI redundante. `pnpm build:installer` gera somente o EXE, usando o compilador .NET Framework do Windows. O instalador ainda não tem assinatura digital. Distribua o código-fonte correspondente e as licenças junto do cliente.

## Downloads de plugins

O cliente 0.4.0 vem configurado para os pacotes individuais de [trwsty/deskcord](https://github.com/trwsty/deskcord), publicados em `plugin-packages/d07030c0968e31e41caa0c35fda0ef8ae63a079e`. Essa pasta precisa permanecer pública e preservar os arquivos de revisões anteriores. Para publicar/configurar a distribuição ou ajustar uma URL salva em um perfil antigo, consulte [docs/PLUGIN_DISTRIBUTION.md](docs/PLUGIN_DISTRIBUTION.md). A instalação confere os hashes autorizados pelo cliente e resolve as dependências automaticamente. Ainda é necessário validar os plugins individualmente dentro do Discord.

## Temas

Em **Themes**, clique em **Abrir pasta de temas**, coloque um `.theme.css` ou `.css` e aperte **Reload**. Nada é baixado ou ativado automaticamente. A autoria é lida do cabeçalho padrão:

```css
/**
 * @name Meu tema
 * @author Seu nome
 * @version 1.0.0
 * @description Uma descrição do tema.
 */
:root {
    --brand-500: #5865f2;
}
```

Aceita o formato de Vencord/BetterDiscord. A aparência depende dos seletores do Discord atual. Imports CSS HTTPS são reunidos nativamente para GitHub Raw, GitHub Pages, GitLab Pages, Codeberg Pages, jsDelivr e Google Fonts, com limites de tamanho, profundidade e tempo, sem seguir redirecionamentos. Imports `layer`/`supports` e arquivos auxiliares locais exigem um CSS já reunido.

Fontes, imagens e outros assets externos continuam sujeitos à CSP original do Discord. Use fontes confiáveis: temas podem fazer requisições externas e piorar desempenho. Limites: 2 MB por arquivo/import, 4 MB reunidos, 16 imports por tema, 256 temas listados e 32 ativos.

Quando configurado, o modo batata pausa os temas e os restaura ao desligar, mantendo as seleções.

## Limites e atribuição

Sem badges, pagamentos, nuvem ou atualizador remoto nesta versão. Os plugins opcionais são baixados individualmente. Desativar remove os arquivos do plugin e as dependências sem outros usuários; opções e preferências são preservadas. Plugins compatíveis podem iniciar e parar na hora, inclusive após o primeiro download. Patches, novos módulos nativos, dependências incompatíveis ou falhas de ciclo de vida exigem reinício; remover o arquivo não descarrega código já aplicado. Somente três módulos internos de compatibilidade vêm no núcleo; nenhum código de plugin opcional integra esse bundle. Filtros para BetterDiscord, Equicord, Universais e Deskcord estão preparados, sem afirmar compatibilidade automática. Plugins de outros formatos precisam de adaptação.

Mods não autorizados contrariam os [termos do Discord](https://discord.com/terms). Não há garantia de compatibilidade futura ou de ausência de risco para contas. Testes no Discord real e benchmarks permanecem necessários. Consulte [docs/VALIDATION.md](docs/VALIDATION.md), [NOTICE.md](NOTICE.md) e [LICENSE](LICENSE).
