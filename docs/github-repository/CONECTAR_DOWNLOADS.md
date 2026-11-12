# Conectar os downloads ao Deskcord

O endereço configurado para esta distribuição é o seguinte. `main` deve ser a branch onde os arquivos foram enviados:

```text
https://raw.githubusercontent.com/{{OWNER}}/{{REPOSITORY}}/main/plugin-packages/{{REVISION}}/
```

O endereço só funciona depois da publicação dos arquivos. Se ainda aparecer `SEU_USUARIO`, substitua os nomes pelos reais. Preserve a barra final e a revisão completa. Se estiver usando outra branch, substitua `main`. Se preferir fixar um commit publicado, use seu SHA no lugar da branch.

## No Discord já instalado

1. Abra Configurações → Plugins.
2. Expanda **Repositório de downloads**, no fim da aba.
3. Cole a URL real e clique em **Salvar repositório**.
4. Ative um plugin. O cliente deve baixar e conferir o pacote, mostrar a ativação e pedir o reinício.
5. Reinicie o Discord para carregar o código instalado.

Salvar o endereço não baixa todos os plugins. Só são baixados os pacotes escolhidos e suas dependências. Os hashes autorizados continuam sendo os que vieram no cliente.

## Para o instalador já vir configurado

No projeto do cliente, edite `src/deskcord/plugins/distribution.json`:

```json
{
    "repository": "https://raw.githubusercontent.com/{{OWNER}}/{{REPOSITORY}}/main/plugin-packages/{{REVISION}}/"
}
```

Depois de substituir os nomes, gere o cliente e o instalador novamente:

```sh
pnpm test
pnpm package:deskcord
```

O endereço de distribuição é o padrão de instalações sem preferência salva. Se um perfil já salvou outra URL ou uma URL vazia, atualize também a opção **Repositório de downloads** no próprio Discord.

## Conferir os arquivos publicados

Adicione `catalog.json` ao fim da URL e abra no navegador. Você deve receber o JSON do catálogo, não uma página de login ou um erro 404. Copie o nome do campo `file` de um plugin disponível e abra-o no mesmo endereço. A [visualização Raw do GitHub](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files) fornece o conteúdo real do arquivo.

Antes do upload, o comando abaixo confere todos os arquivos locais sem executar o código dos plugins:

```sh
node scripts/deskcord/verify-github.mjs
```

Se houver erro de integridade, republique os bytes originais. Não edite os pacotes manualmente nem desative a conferência de hash. Para uma nova revisão do catálogo, gere novos pacotes e mantenha as revisões antigas disponíveis. O diretório `src/plugins` do Vencord contém fontes; ele não substitui este endereço de pacotes compilados.
