# Piped TV

Módulo **TizenBrew** para TV Samsung (Tizen): YouTube **sem anúncio**, via [Piped](https://github.com/TeamPiped/Piped). UI pensada para controle remoto e codec **avc1 forçado** — o remédio direto para o travamento de imagem/decoder que o TizenTube sofre.

## Por que Piped e não remendo no player

O TizenTube briga com o player do YouTube — Google muda o player toda semana e o anúncio volta, ou a imagem trava (VP9/AV1 em decoder que a TV não aguenta). Piped **nunca serve anúncio**: é um proxy entre você e o YouTube, e o stream é decidido pelo nosso código (avc1 combinado primeiro, HLS como fallback, qualidade com teto configurável).

## Como funciona a escolha de stream

1. Busca streams combinados (vídeo+áudio, tocáveis direto no `<video>`).
2. Prefere **avc1** (via `codec`/`itag`/`mimeType`) até o teto de qualidade (padrão 720p).
3. Sem avc1 combinado → usa **HLS** (via hls.js), que o servidor Piped muxa.
4. Modo "qualquer (qualidade)" em Ajustes libera VP9/AV1 quando você quiser qualidade acima de 720p.
5. Sem stream reproduzível → erro claro com botão de trocar instância.

## Publicar (uma vez)

1. Crie o repositório: `github.com/SEU_USUARIO/tizen-piped-tv`. Atualize `repository.url` e o nome em `package.json`.
2. Empurre esta pasta (raiz: `package.json`, `index.html`, `app/`, `test/`).
3. **GitHub Pages**: Settings → Pages → Source: `Deploy from a branch`, branch `main`, `/ (root)`. Espere o primeiro build.
4. Crie uma **tag**: `git tag v1.0.0 && git push origin v1.0.0`. O TizenBrew carrega módulos por tag.

## Instalar na TV

1. Na TV, abra **TizenBrew**.
2. **Add Module** → digite `SEU_USUARIO/tizen-piped-tv`.
3. Abra pelo dashboard. Pronto.

Teste antes no navegador do PC em `https://SEU_USUARIO.github.io/tizen-piped-tv/` — mesma UI, mesmas teclas (setas + Enter).

## Controle remoto

| Tecla | Ação |
|---|---|
| Setas | mover foco (grade espacial) |
| Enter | abrir / executar |
| Voltar (10009) | voltar ao início |
| 🔴 (F1) | Ajustes |
| 🟢 (F2) | Buscar |
| 🟡 (F3) | Início |
| 🔵 (F4) | trocar instância / repetir stream |
| Play/Pause/Stop | vídeo |
| Rewind/Fast-forward | ±10s |
| Track prev/next | vídeo anterior/próximo da lista |

## Instâncias

Padrão incluído (multi-instância com troca por 🔵 ou no Ajustes):

- `pipedapi.ducks.party`
- `pipedapi.wireway.ch`
- `api.piped.private.coffee`
- `piped.video`
- `pipedapi.kavin.rocks`

**Lista viva de instâncias**: https://github.com/TeamPiped/Piped/wiki/Instances

## O muro anti-bot — e a solução durável

O YouTube às vezes bloqueia IPs de instâncias públicas com *"Sign in to confirm you're not a bot"* — é por isso que existe o botão de trocar instância. Se usar Piped com frequência, **hospede sua própria instância** (IP residencial/VPS limpo resolve de vez):

```bash
# pipectl — Piped oficial
curl https://piped.video/install.sh | sh
pipectl init
# depois de configurar domínio + HTTPS, use sua instância em Ajustes
```

Docker alternativo (com Tor/Polipo embutido, clássico do Piped): siga o `docker-compose.yml` do [repositório Piped](https://github.com/TeamPiped/Piped).

## Limites honestos

- **DRM**: vídeos premium/protegidos (alguns VEVO, filmes) não tocam — Piped não tem licença Widevine.
- **Instâncias públicas** podem cair ou ficar lentas — troque, ou auto-hospede.
- O módulo precisa de **rede** (sai da TV para a instância).
- Modelos 2024+ (Tizen 8) são mais restritos para TizenBrew em geral — confira o suporte do projeto para o ano do seu painel.

## Verificação

```bash
node --check app/app.js
node test/smoke.js   # 7 asserts: picker avc1/HLS/cap e boot
```