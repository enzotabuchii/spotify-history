# Histórico do Spotify

Um site para fuçar no histórico estendido do Spotify (o `my_spotify_data.zip`): quanto você ouviu por dia, semana, mês
ou ano, quem são seus artistas e estilos, o que você mais pula, as músicas mais longas e mais curtas, e outras coisas
do tipo.

Comecei fazendo isso para o meu próprio histórico. Agora qualquer pessoa pode abrir o site, soltar o zip (ou os `.json`
de dentro dele) e ver os mesmos gráficos com os próprios dados.

## Para ver o seu histórico

1. Em <https://www.spotify.com/account/privacy/>, marque **Histórico de streaming estendido** e peça os dados. O
   Spotify avisa que pode levar até 30 dias.
2. Abra o site e solte o `my_spotify_data.zip` na página. Não precisa extrair.

Os arquivos são lidos no navegador e nada vai para servidor nenhum. O export não traz gênero musical, então o site
oferece buscar no MusicBrainz o gênero dos artistas que você mais ouve, de 50 em 50. Nessa busca, só os nomes dos
artistas saem do seu computador, e o resultado fica guardado no `localStorage` para a próxima visita.

O histórico curto (opção "Dados da conta", arquivos `StreamingHistory_music_*.json`) também funciona. Ele só cobre o
último ano e não tem álbum nem pulos, então alguns quadros ficam vazios.

## Rodando localmente com um histórico fixo

Se existir um `public/data/history.json`, o site abre direto nele e mostra um botão para a pessoa ver o dela. Sem esse
arquivo, a primeira tela já é a de upload.

1. Extraia o zip. Os scripts procuram em `~/Downloads/my_spotify_data/Spotify Extended Streaming History`. Se estiver
   em outro lugar, defina `SPOTIFY_DATA_DIR`.
2. (Opcional) Busque os gêneros dos N artistas mais ouvidos. Leva cerca de 1 s por artista, e se você interromper, o
   script continua de onde parou:
   ```bash
   npm run genres -- 1000
   ```
   O resultado vai para `data/genres.json`.
3. Gere o dataset e suba o servidor:
   ```bash
   npm run data
   npm run dev
   ```

`data/` e `public/data/` estão no `.gitignore`. O dataset gerado não guarda endereço IP.

## Como os números são calculados

- O Spotify não informa a duração das faixas. Uso a reprodução mais longa que terminou com a música chegando ao fim.
- Os gêneros vêm das tags do MusicBrainz (no script, com o Deezer como plano B) e são agrupados em estilos mais amplos.
  As regras ficam em `lib/build.ts`, que é o mesmo código usado pelo script e pelo upload no navegador.
- Uma "reprodução" conta a partir de 30 s ouvidos, o mesmo critério do Spotify. "Pulo" é quando você apertou para
  avançar.
