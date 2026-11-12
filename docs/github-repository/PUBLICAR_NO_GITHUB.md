# Publicar o Deskcord no GitHub

Esta pasta está preparada para ser a raiz de um repositório. Não envie apenas o ZIP: o Deskcord precisa acessar os pacotes JSON individuais.

## Pelo GitHub Desktop

1. Extraia `Deskcord-GitHub-{{VERSION}}.zip` e abra a pasta extraída. Ela deve conter `README.md`, `src`, `docs` e `plugin-packages` no mesmo nível.
2. No GitHub Desktop, use **File → Add local repository** e selecione essa pasta. Se ela ainda não for um repositório, use a opção de criá-lo nesse local.
3. Confira os arquivos e faça o commit inicial, se necessário.
4. Use **Publish repository**, escolha um nome como `Deskcord` e deixe o repositório **público**, sem marcar a opção de manter privado.
5. Confirme no site que a raiz contém `README.md`, `src`, `docs` e `plugin-packages`. O guia de downloads usa a branch `main`; se a branch criada tiver outro nome, use esse nome no endereço.

O Desktop só deve enviar o conteúdo desta pasta preparada. Não selecione a pasta de perfil do Discord ou a pasta de trabalho original com seus arquivos locais.

## Pelo Git

Crie um repositório público vazio no GitHub. Dentro da pasta preparada, execute os comandos abaixo, substituindo `SEU_USUARIO` e `SEU_REPOSITORIO` pelos nomes reais:

```sh
git init -b main
git add .
git commit -m "Publicar Deskcord {{VERSION}} e pacotes de plugins"
git remote add origin https://github.com/{{OWNER}}/{{REPOSITORY}}.git
git push -u origin main
```

Não coloque token ou senha na URL. Use a autenticação normal do Git/GitHub Desktop. Se o repositório remoto já tem conteúdo, clone-o em outra pasta e copie os arquivos preparados para lá; não use push forçado.

## Pelo navegador

É possível usar **Add file → Upload files**, preservando a estrutura de pastas. O [GitHub limita cada envio pelo navegador a 100 arquivos e 25 MiB por arquivo](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository). Como esta distribuição tem mais de 100 arquivos, use GitHub Desktop/Git ou faça vários envios. Não publique uma pasta extra envolvendo tudo: `README.md` precisa ficar na raiz do repositório.

## O que já está incluído

- Fontes do cliente, instalador e plugins; scripts e testes.
- Catálogo e {{PACKAGES}} pacotes compilados, incluindo dependências.
- Documentação em português, licenças e atribuições.
- Verificador local de tamanho, SHA-256 e correspondência com o catálogo.

O instalador EXE não foi colocado nesta pasta. Para distribuí-lo, adicione `Deskcord-Setup-{{VERSION}}.exe` e o ZIP de código-fonte correspondente a um GitHub Release do mesmo repositório. O arquivo da versão {{VERSION}} está na pasta `release` do projeto original. Não use Git LFS para os pacotes JSON: o cliente precisa dos bytes reais, não de arquivos apontadores.

## Depois do upload

Siga [Conectar os downloads](CONECTAR_DOWNLOADS.md). Não é necessário GitHub Pages para o caminho Raw documentado. Não há servidor, banco de dados ou chave de API neste repositório de arquivos públicos.

Antes de divulgar, confirme que `catalog.json` e um pacote individual abrem pelo endereço Raw e que o cliente consegue instalar um plugin. A verificação local não comprova disponibilidade da hospedagem.
