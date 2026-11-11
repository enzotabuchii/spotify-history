# Meu histórico no Spotify

Site para visualizar o histórico estendido do Spotify (`my_spotify_data.zip`): por dia, semana, mês, ano ou todo o
período, com filtro por artista e por estilo musical, músicas mais longas/curtas e outras curiosidades.

## Como usar

1. Peça seu histórico em <https://www.spotify.com/account/privacy/> (opção **Extended streaming history**) e extraia
   o zip. Por padrão os scripts procuram em `~/Downloads/my_spotify_data/Spotify Extended Streaming History`; para
   outro lugar, defina `SPOTIFY_DATA_DIR`.
2. (Opcional, ~1 s por artista) Busque os gêneros no MusicBrainz para os N artistas mais ouvidos:
   ```bash
   npm run genres -- 1000
   ```
   O resultado fica em `data/genres.json` e o script continua de onde parou se for interrompido.
3. Gere o dataset do site e rode:
   ```bash
   npm run data
   npm run dev
   ```

Os dados pessoais (`data/` e `public/data/`) estão no `.gitignore`. O dataset gerado não inclui endereço IP.

## Observações

- O export do Spotify não traz a duração das faixas nem o gênero. A duração é estimada pela reprodução mais longa que
  terminou com a faixa chegando ao fim; os gêneros vêm das tags do MusicBrainz, agrupadas em estilos amplos
  (regras em `scripts/build-data.mjs`).
- Uma “reprodução” conta a partir de 30 s ouvidos (mesmo critério do Spotify). “Pulo” = botão de avançar.
