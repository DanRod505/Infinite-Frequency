# Infinite Frequency

Jogo 3D de corrida musical para navegador: o veículo percorre estradas e cenários gerados proceduralmente, sincronizados com a música escolhida. O documento de concepção completo está em [`docs/GDD.md`](docs/GDD.md).

## Estado atual — Fase 1: protótipo de direção

Seguindo a diretriz do GDD (§18), o desenvolvimento começa pelos fundamentos. Esta versão entrega a **Fase 1** do roadmap (§13):

| Entrega | Implementação |
|---|---|
| Cena 3D | Three.js / WebGL, atmosfera mínima Neon Dreams (céu em gradiente, sol retrô, névoa, grade) |
| Veículo | Modelo estilizado de primitivas, inclinação nas manobras, suspensão visual, rodas girando |
| Câmera | Perseguição suavizada, FOV adaptativo à velocidade, acompanha a inclinação da pista, tremor opcional |
| Pista contínua | Eixo central integrado a partir de curvatura e inclinação com taxa de variação limitada |
| Direção lateral | Contínua (sem faixas fixas), responsiva, limitada às bordas da pista |
| Geração de segmentos | Chunks de 120 m, determinísticos por seed |
| Descarregamento | Janela de chunks ativa ao redor do veículo; malhas reutilizadas por pool, dados antigos liberados |

### Controles

| Tecla | Ação |
|---|---|
| A / ← | Direcionar à esquerda |
| D / → | Direcionar à direita |
| Esc | Pausar / continuar |
| N | Nova pista (nova seed) |
| F3 | Painel de depuração (seed, FPS, chunks, draw calls) |
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
  core/      RNG determinístico, loop de passo fixo, input, utilidades matemáticas
  track/     TrackGenerator (geometria procedural) e TrackRenderer (malhas, streaming, pooling)
  vehicle/   VehicleController (lógica arcade, testável) e VehicleModel (visual)
  camera/    ChaseCamera
  world/     Environment (céu, sol, névoa, grade, luzes)
  ui/        HUD em DOM
  game/      Game — coordena os sistemas sem assumir suas responsabilidades
tests/       determinismo, continuidade, restrições geométricas e controlador do veículo
```

### Geração da pista (GDD §4)

Em vez de ajustar splines independentes por segmento, o eixo central é **integrado** a partir de curvatura (guinada) e inclinação (pitch), cujas taxas de variação são limitadas — transições do tipo clotoide. Isso garante por construção:

- **Continuidade** de posição, tangente e curvatura entre chunks (a primeira amostra de cada chunk é a última do anterior).
- **Curvas compatíveis com a velocidade**: raio mínimo de 160 m, com entrada e saída progressivas.
- **Sem mudanças bruscas de inclinação**: pitch e sua taxa de variação são limitados.
- **Banking** proporcional à curvatura, com limite.
- **Sem autointerseção**: um controle preditivo mantém o heading a menos de 90° da direção principal (pior caso medido: 83° em 500 seeds × 48 km), e a elevação fica numa faixa limitada.
- **Determinismo**: cada chunk usa um RNG derivado de `(seed, índice)`; o resultado não depende de como a geração é fatiada no tempo.

Todos os parâmetros ficam em `src/track/TrackConfig.ts`.

### Sincronização

A simulação roda em passo fixo de 1/120 s, com interpolação na renderização, o que torna a jogabilidade independente da taxa de quadros (GDD §3.4). Na Fase 2, o relógio do áudio passará a ser a referência temporal.

## Decisões tomadas nesta fase

- **D01 — Controle:** direção lateral contínua implementada como modelo principal.
- **D02 — Velocidade:** fixa por enquanto (cruzeiro de 55 m/s ≈ 198 km/h, configurável em `VehicleTuning`).
- **D07 — Cenários:** atmosfera mínima no estilo Neon Dreams, só o necessário para leitura de velocidade e profundidade.
- **React** (previsto no GDD §11.1) ainda não foi adotado: o HUD da Fase 1 é DOM simples. Entra junto com os menus da Fase 5.

## Próximos passos (Fase 2 — integração musical)

Importação de áudio local, reprodução via Web Audio API, análise de energia e detecção básica de batidas, linha temporal musical e eventos sincronizados.

Pontos técnicos já identificados:

- **Origem flutuante:** as posições crescem com a distância; em sessões muito longas (dezenas de km), rebasear a origem do mundo evitará perda de precisão em float32.
- **Pós-processamento** (bloom) ficou fora da Fase 1 para preservar desempenho e simplicidade.
