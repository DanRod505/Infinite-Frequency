# Infinite Frequency

Jogo 3D de corrida musical para navegador: o veículo percorre estradas e cenários gerados proceduralmente, sincronizados com a música escolhida. O documento de concepção completo está em [`docs/GDD.md`](docs/GDD.md).

## Estado atual — Fase 2: integração musical

Seguindo a diretriz do GDD (§18), o desenvolvimento avança pelos fundamentos. Fases concluídas:

### Fase 1 — protótipo de direção

| Entrega | Implementação |
|---|---|
| Cena 3D | Three.js / WebGL, atmosfera mínima Neon Dreams (céu em gradiente, sol retrô, névoa, grade) |
| Veículo | Modelo estilizado de primitivas, inclinação nas manobras, suspensão visual, rodas girando |
| Câmera | Perseguição suavizada, FOV adaptativo à velocidade, acompanha a inclinação da pista, tremor opcional |
| Pista contínua | Eixo central integrado a partir de curvatura e inclinação com taxa de variação limitada |
| Direção lateral | Contínua (sem faixas fixas), responsiva, limitada às bordas da pista |
| Geração de segmentos | Chunks de 120 m, determinísticos por seed |
| Descarregamento | Janela de chunks ativa ao redor do veículo; malhas reutilizadas por pool, dados antigos liberados |

### Fase 2 — integração musical

| Entrega | Implementação |
|---|---|
| Importação de áudio | Arquivo local (botão ou arrastar e soltar), decodificado pelo navegador; nada é enviado a servidores |
| Reprodução | Web Audio API, volume, pausa/retomada, contagem regressiva de 3 s antes da música |
| Análise de energia | Energia global e bandas grave / médio / agudo, normalizadas em relação à própria música |
| Detecção de batidas | Fluxo espectral → BPM por autocorrelação → rastreamento por programação dinâmica (Ellis, 2007) |
| Linha temporal | Seções por intensidade, drops estimados, downbeats; eventos entregues exatamente uma vez, independentemente do FPS |
| Eventos sincronizados | Linhas da pista e luz inferior pulsam na batida, sol e grade no grave, partículas nos agudos, paleta do céu pela intensidade da seção, flash e tremor nos drops |
| Pista e música (D04) | Seções calmas geram mais retas e curvas suaves; seções intensas, curvas mais vivas — sempre dentro dos mesmos limites geométricos |

Também incluídos:

- **Faixa de demonstração** sintetizada proceduralmente (128 BPM, com build-ups e drops), para jogar sem arquivo e servir de gabarito nos testes.
- **Análise em Web Worker**, com barra de progresso; o menu continua responsivo.
- **Cache de análises** em IndexedDB, indexado pelo SHA-256 do arquivo: a mesma música abre instantaneamente na segunda vez.
- **Acessibilidade (§12.4)**: volume, intensidade dos efeitos, redução de flashes, tremor de câmera desligável e ajuste de latência — tudo salvo no navegador.
- **Telas**: menu principal, progresso da análise, resumo da música (duração, BPM com confiança, seções, drops), pausa e fim da música (repetir percurso, nova variação, outra música).

### Controles

| Tecla | Ação |
|---|---|
| A / ← | Direcionar à esquerda |
| D / → | Direcionar à direita |
| Esc | Pausar / continuar |
| [ / ] | Ajustar a latência em ±5 ms durante a corrida |
| N | Nova pista (só em "Dirigir sem música") |
| F3 | Painel de depuração (seed, FPS, tempo da música, BPM, latência…) |
| Espaço | Reservado para mecânica futura |

A seed fica na URL (`?seed=42`), então o mesmo percurso pode ser reproduzido e compartilhado. Seeds não numéricas (`?seed=neon`) também funcionam.

## Como rodar

Requer Node.js 20+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (Vitest)
npm run typecheck  # verificação de tipos
npm run build      # build de produção em dist/
```

> O `.npmrc` ativa `legacy-peer-deps` para contornar um bug do npm 10 ao resolver as peer dependencies opcionais do Vitest.

## Arquitetura

```
src/
  App.ts     fluxo: importação → análise → seed → corrida → resultados
  audio/     AudioEngine, PlaybackClock, MusicAnalyzer (+ FFT), MusicTimeline,
             worker de análise, cache IndexedDB, faixa de demonstração
  core/      RNG determinístico, loop de passo fixo, input, configurações
  track/     TrackGenerator (geometria procedural) e TrackRenderer (malhas, streaming, pooling)
  vehicle/   VehicleController (lógica arcade, testável) e VehicleModel (visual)
  camera/    ChaseCamera
  world/     Environment (céu, sol, névoa, grade, luzes, partículas)
  ui/        Menu e HUD em DOM
  game/      Game (sessão), GameDirector (música → parâmetros visuais), runTiming
tests/       determinismo, continuidade, restrições geométricas, controlador,
             análise musical contra gabarito, linha temporal e sincronização
```

Pipeline (GDD §11.3): **arquivo → análise (worker) → linha temporal → geração de pista e cenário → execução sincronizada → resultados.**

### Análise musical (GDD §3.2)

O sinal é convertido para mono e ~22 kHz e analisado em quadros de 23 ms. O resultado separa o que é **medido** do que é **estimado**:

- **Medido:** energia, bandas grave / médio / agudo e intensidade de transientes (fluxo espectral), além da lista de transientes.
- **Estimado, com confiança:** andamento, batidas, downbeats (fase do compasso), seções e drops.

Detalhes:

- O BPM vem da autocorrelação do envelope de transientes, com uma preferência suave por andamentos próximos de 120 BPM e refinamento subquadro pelos picos múltiplos.
- As batidas são rastreadas por programação dinâmica, que acompanha pequenas variações de andamento. Nos trechos sem pulso claro (breaks), as batidas são redistribuídas entre âncoras fortes para não derivarem.
- Os downbeats são votados pelas fronteiras de seção, que quase sempre caem no início do compasso.
- Se o pulso não for confiável (confiança < 35%), o jogo usa os transientes como fallback (§15.1).

Precisão medida nos testes: na faixa demo, BPM com erro < 0,5, todas as batidas a menos de 20 ms do gabarito, seções e drops a menos de 100 ms. Em trilhas de clique, andamentos de 65 a 174 BPM são detectados exatamente. Acima disso, a estimativa pode cair para a metade (ambiguidade de oitava): as batidas detectadas continuam no tempo, só que uma sim, uma não.

### Sincronização (GDD §3.4)

O **áudio é o relógio mestre**. A posição da música considera a latência de saída informada pelo navegador (`getOutputTimestamp`) mais o ajuste manual do jogador. A simulação roda em passo fixo de 1/120 s perseguindo esse relógio, com interpolação na renderização.

O carro parte do repouso 3 s antes da música e já está em velocidade de cruzeiro quando ela começa. Assim, a distância percorrida em cada instante da música é determinística (`runTiming.ts`) — base para posicionar os coletáveis na Fase 3.

### Geração da pista (GDD §4)

Em vez de ajustar splines independentes por segmento, o eixo central é **integrado** a partir de curvatura (guinada) e inclinação (pitch), cujas taxas de variação são limitadas — transições do tipo clotoide. Isso garante por construção:

- **Continuidade** de posição, tangente e curvatura entre chunks (a primeira amostra de cada chunk é a última do anterior).
- **Curvas compatíveis com a velocidade**: raio mínimo de 160 m, com entrada e saída progressivas.
- **Sem mudanças bruscas de inclinação**: pitch e sua taxa de variação são limitados.
- **Banking** proporcional à curvatura, com limite.
- **Sem autointerseção**: um controle preditivo mantém o heading a menos de 90° da direção principal (pior caso medido: 83° em 500 seeds × 48 km), e a elevação fica numa faixa limitada.
- **Determinismo**: cada chunk usa um RNG derivado de `(seed, índice)`; o resultado não depende de como a geração é fatiada no tempo.

Todos os parâmetros ficam em `src/track/TrackConfig.ts`.

## Decisões tomadas até aqui

- **D01 — Controle:** direção lateral contínua implementada como modelo principal.
- **D02 — Velocidade:** fixa por enquanto (cruzeiro de 55 m/s ≈ 198 km/h, configurável em `VehicleTuning`). Velocidade constante simplifica a relação tempo ↔ distância para os coletáveis.
- **D03 — Música:** qualquer formato que o navegador decodifique (MP3 e WAV garantidos), de 10 s a 20 min e até 200 MB; análise completa antes da corrida, em worker.
- **D04 — Geração:** a música só modula o quão "viva" é a pista (proporção de retas, amplitude das curvas), nunca os limites geométricos. Curvas não são disparadas por batidas.
- **D07 — Cenários:** atmosfera Neon Dreams, agora reativa à música.
- **D09 — Persistência:** análises no IndexedDB (até 20, pelo hash do arquivo); configurações no localStorage; seed na URL.
- **React** (previsto no GDD §11.1) ainda não foi adotado: menus e HUD são DOM simples. Entra com os menus completos da Fase 5.

## Próximos passos (Fase 3 — jogabilidade rítmica)

Coletáveis posicionados nas batidas (distância derivada do tempo da música), padrões validados pela capacidade lateral do veículo, combos, pontuação e tela de resultados com recordes.

Pontos técnicos já identificados:

- **Origem flutuante:** as posições crescem com a distância (~6,6 km numa música de 2 min); em sessões muito longas, rebasear a origem do mundo evitará perda de precisão em float32.
- **Pós-processamento** (bloom) ainda fora, para preservar desempenho.
- **Andamento variável:** o rastreador acompanha pequenas variações, mas o BPM exibido é global; músicas com mudanças bruscas de andamento são o próximo ponto de robustez da análise.
