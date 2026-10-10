# Infinite Frequency

Jogo 3D de corrida musical para navegador: o veículo percorre estradas e cenários gerados proceduralmente, sincronizados com a música escolhida. O documento de concepção completo está em [`docs/GDD.md`](docs/GDD.md).

**Jogar no navegador:** https://danrod505.github.io/Infinite-Frequency/

## Estado atual — Fase 4: cenário procedural

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

### Fase 3 — jogabilidade rítmica

| Entrega | Implementação |
|---|---|
| Coletáveis | Gemas luminosas nas batidas detectadas; notas especiais (douradas) nos drops e no início das seções intensas |
| Padrões | Sequências rítmicas (linha, zigue-zague, varredura, onda, escada) que pedem movimento contínuo |
| Validador | Cada nota é alcançável a partir da anterior com folga para a capacidade lateral do carro; obstáculos só onde a rota entre as notas fica livre |
| Colisões | Barreiras listradas de vermelho (Normal/Difícil, opcionais): quebram o combo e tiram 150 pontos, sem encerrar a corrida |
| Combos | Multiplicador x1 (0–9), x2 (10–24), x3 (25–49), x4 (50+); perder uma nota zera o combo |
| Pontuação | Perfeita 100, boa 70, especial 250/180, bônus de 30 por nota em sequência completa |
| Resultados | Pontuação, classificação S–D, notas coletadas, perfeitas, maior combo, precisão, colisões e recorde anterior |

Também incluídos:

- **Modos (GDD §7):** **Rhythm Run** (competitivo) e **Free Ride** (só música e estrada, sem notas nem obstáculos).
- **Dificuldades (D06):** Fácil, Normal e Difícil mudam a densidade de notas, a amplitude dos padrões, a folga exigida e a presença de obstáculos.
- **Recordes locais** por música, dificuldade e obstáculos, salvos no navegador.
- **Pontuação consistente:** cada nota é julgada no passo fixo da simulação em que o carro cruza sua distância, então o mesmo percurso jogado do mesmo jeito dá sempre a mesma pontuação.

### Fase 4 — cenário procedural

| Entrega | Implementação |
|---|---|
| Bioma Neon Dreams | Montanhas geométricas em wireframe, torres e monólitos com janelas, cristais flutuantes, postes de luz nas bordas e pilares sustentando a pista elevada |
| Objetos procedurais | Gerados por trecho de pista e determinísticos pela seed; a densidade e a altura acompanham a intensidade da música |
| Iluminação dinâmica | Postes pulsam na batida e se acendem nos build-ups, janelas com os médios, montanhas com os graves, cristais com os agudos; bloom configurável |
| Partículas | Brilhos ambientes (agudos), linhas de velocidade nas passagens intensas e explosão no drop, com limites fixos |
| Eventos ambientais | Túnel de anéis de luz no início de cada seção intensa, com um anel em cada batida (o carro atravessa um por batida), e portal monumental nos drops |
| Transições | Uma paleta por seção (pôr do sol, meia-noite, ultravioleta, inferno), interpolada em 2,5 s; mais rápida quando um túnel esconde a mudança; instantânea só no drop |

Também incluídos:

- **Planejamento antecipado (§5.4):** os eventos são definidos pela análise antes da corrida e posicionados na pista pelo mapeamento tempo → distância.
- **Segurança da pista:** nenhum objeto invade o corredor da pista, nem onde outro trecho dela passa por perto. Os testes verificam isso contra todos os pontos da pista em várias seeds.
- **Legibilidade (§15.5):** o bloom só realça o que é realmente brilhante, a explosão do drop fica no céu, e as notas (brancas) e os obstáculos (listrados de vermelho) seguem distintos do cenário.
- **Desempenho (§11.4):** uma malha instanciada por tipo de objeto; ~65 draw calls por quadro com cenário, notas, eventos e bloom. O bloom pode ser desligado nas configurações.
- **Sem música**, a paleta muda a cada 40 s para mostrar a variação do bioma.

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

### Publicação no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` roda os testes, gera o build e publica o site a cada push em `main` ou `claude/inspiring-turing-tn0pf0` (ou manualmente, pela aba Actions). Na primeira vez, é preciso ativar o Pages no repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

O build usa caminhos relativos (`base: './'`), então funciona no subcaminho `/Infinite-Frequency/` sem configuração extra.

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
  world/     Environment (céu, sol, névoa, grade, luzes), paletas, WorldPlanner
             (eventos planejados), SceneryGenerator/Renderer (objetos procedurais),
             EventRenderer (túneis e portais), Particles
  ui/        Menu e HUD em DOM
  game/      Game (sessão), GameDirector (música → parâmetros visuais), runTiming, PostFX (bloom)
  rhythm/    ChartGenerator (notas, padrões, validador, obstáculos), RhythmSystem
             (julgamento), ScoreKeeper (pontos e combos), RhythmRenderer, Records
tests/       determinismo, continuidade, restrições geométricas, controlador,
             análise musical contra gabarito, linha temporal, sincronização,
             partitura, jogabilidade (piloto robô), pontuação, recordes,
             planejamento do mundo e folga do cenário em relação à pista
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

### Coletáveis e jogabilidade (GDD §6)

A distância de cada nota vem do instante musical (`runTiming.ts`): o carro passa por ela exatamente quando a batida toca. Coletar é uma questão de posição lateral: a nota é julgada no passo fixo da simulação em que o carro cruza sua distância, usando a posição lateral interpolada no cruzamento.

Nos testes, um **piloto robô** joga a faixa demo e trilhas de 90 e 150 BPM em todas as dificuldades. Ele coleta 100% das notas e não bate em nenhum obstáculo, tanto com direção analógica quanto com direção digital como a de um teclado (só esquerda, direita ou nada). Isso garante as exigências do §12.1: padrões executáveis e nenhum obstáculo inevitável.

**Sem redução de velocidade nas colisões (D05):** a velocidade constante é o que mantém as notas sincronizadas com a música. A penalidade é perder o combo e 150 pontos, com tremor e um brilho vermelho nas bordas da tela.

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
- **D05 — Colisões:** quebram o combo e tiram 150 pontos, com efeito visual; sem redução de velocidade (manteria as notas fora de sincronia) e sem encerrar a corrida.
- **D06 — Dificuldade:** três níveis com densidade, amplitude, folga e obstáculos próprios (`DIFFICULTY_PRESETS` em `src/rhythm/types.ts`).
- **D04 — Geração:** a música só modula o quão "viva" é a pista (proporção de retas, amplitude das curvas), nunca os limites geométricos. Curvas não são disparadas por batidas.
- **D07 — Cenários:** Neon Dreams confirmado como bioma inicial, com quatro variações de paleta por seção.
- **D09 — Persistência:** análises no IndexedDB (até 20, pelo hash do arquivo); configurações no localStorage; seed na URL.
- **React** (previsto no GDD §11.1) ainda não foi adotado: menus e HUD são DOM simples. Entra com os menus completos da Fase 5.

## Próximos passos (Fase 5 — vertical slice)

Menu principal completo, seleção de música e de modo, configurações, resultados e otimização inicial, para que uma pessoa consiga iniciar, jogar e concluir uma sessão completa sem assistência.

Pontos técnicos já identificados:

- **Desempenho real:** o orçamento de draw calls está baixo, mas o FPS precisa ser medido em máquinas desktop de referência (o ambiente de desenvolvimento não tem GPU). Um seletor de qualidade gráfica (§11.4) deve vir junto.
- **Balanceamento:** pontuação, folgas e densidade por dificuldade são provisórios e ficam em `src/rhythm/types.ts`.
- **Sons de coleta** e **sensibilidade da direção (§12.4)** ainda não existem.
- **Origem flutuante:** as posições crescem com a distância; em sessões muito longas, rebasear a origem do mundo evitará perda de precisão em float32.
- **Outros biomas** (Cyber City, Ethereal Forest, Cosmic Highway) pertencem à Fase 6; o sistema de paletas e cenário por trecho já separa pista e ambiente como o §5.1 pede.
