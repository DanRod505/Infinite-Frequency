# GAME DESIGN DOCUMENT
## INFINITE FREQUENCY
**Versão:** 1.0 — Documento de concepção  
**Gênero:** Corrida musical / Arcade / Rhythm Game  
**Plataforma principal:** Navegadores desktop  
**Tecnologias previstas:** TypeScript, Three.js, Web Audio API  
**Modelo de distribuição:** Jogo web, inicialmente single-player  
**Status:** Pré-produção

---

# 1. VISÃO GERAL

## 1.1. Conceito

*Infinite Frequency* é um jogo tridimensional de corrida musical no qual o jogador conduz um veículo por estradas e ambientes gerados proceduralmente, sincronizados com a música selecionada.

O jogo combina a acessibilidade de *Music Racer*, a estética de corridas futuristas e sistemas de geração procedural para proporcionar experiências audiovisuais diferentes a cada sessão.

A música não funciona apenas como trilha sonora: ela influencia a estrutura dos eventos, a distribuição de coletáveis, a iluminação, a atmosfera e as transformações do cenário.

O jogo deverá ser executável diretamente em navegadores modernos, sem necessidade de instalação.

## 1.2. Proposta de valor

**Transformar qualquer música compatível em uma viagem audiovisual interativa, visualmente dinâmica e mecanicamente envolvente.**

O projeto deverá se diferenciar por:

- Pistas procedurais que acompanham a progressão musical.
- Cenários dinâmicos e reativos às características do áudio.
- Direção arcade acessível, com movimentação lateral contínua.
- Modos de jogo contemplativos e competitivos.
- Importação de músicas locais.
- Personalização de veículos e efeitos.
- Alta rejogabilidade, com possibilidade de variar os cenários de uma mesma música.

## 1.3. Público-alvo

Jogadores que apreciam jogos musicais, experiências audiovisuais, corridas arcade e jogos casuais de curta duração.

O projeto deve ser acessível a jogadores iniciantes, mas oferecer desafios opcionais para usuários interessados em precisão, combos e recordes.

## 1.4. Princípios de design

1. **Música como elemento central:** os sistemas visuais e jogáveis devem respeitar a estrutura musical.
2. **Simplicidade de controle:** o jogador deve compreender os controles imediatamente.
3. **Variedade procedural:** cada percurso deve apresentar combinações interessantes sem comprometer a legibilidade.
4. **Espetáculo audiovisual:** os cenários devem oferecer momentos memoráveis.
5. **Desafio justo:** a dificuldade deve resultar de padrões previsíveis e executáveis.
6. **Desempenho:** a experiência deve funcionar de maneira fluida em computadores comuns.

---

# 2. GAMEPLAY PRINCIPAL

## 2.1. Loop de jogo

O ciclo principal é composto pelas seguintes etapas:

1. Selecionar uma música.
2. Escolher veículo, cenário e modo de jogo.
3. Analisar o áudio e preparar o percurso.
4. Iniciar a viagem.
5. Conduzir o veículo, coletar objetos e evitar obstáculos.
6. Reagir às mudanças musicais e visuais.
7. Concluir a música e receber os resultados.
8. Repetir a experiência, buscar recordes ou modificar as configurações.

Uma sessão típica deverá durar aproximadamente o tempo da música escolhida.

## 2.2. Sistema de direção

O modelo inicial será de **direção arcade híbrida**.

O veículo avança automaticamente pela estrada, enquanto o jogador controla seu posicionamento lateral.

A direção deverá ser contínua, permitindo movimentos suaves em vez de restringir o veículo a três faixas fixas.

### Controles previstos

| Entrada | Ação |
|---|---|
| A / Seta esquerda | Direcionar à esquerda |
| D / Seta direita | Direcionar à direita |
| Espaço | Ação especial contextual |
| Esc | Pausar |
| Mouse | Navegação nos menus |

A ação especial será inicialmente reservada para uma mecânica futura, como impulso ou derrapagem. Não fará parte do primeiro protótipo.

### Características da condução

- Aceleração longitudinal automática.
- Direção lateral responsiva.
- Suavização opcional do movimento.
- Inclinação visual do veículo durante manobras.
- Animação de suspensão.
- Efeitos de velocidade e partículas.
- Câmera dinâmica acompanhando o veículo.

O sistema não utilizará inicialmente física automotiva realista.

O carro será representado por um controlador arcade, com comportamento previsível e independente de simulações complexas de pneus, transmissão ou suspensão.

## 2.3. Velocidade

A velocidade deverá ser controlada principalmente pelo sistema de jogo.

Poderão existir variações associadas à intensidade musical e aos eventos especiais, desde que não comprometam a capacidade de reação do jogador.

**Regra de design:** alterações de velocidade não devem tornar obstáculos inevitáveis.

A velocidade base será configurável por modo de jogo e dificuldade.

## 2.4. Câmera

A câmera principal será posicionada atrás e ligeiramente acima do veículo.

Características:

- Acompanhamento suavizado.
- Campo de visão adaptativo à velocidade.
- Pequena inclinação em curvas.
- Movimentação vertical amortecida.
- Efeitos opcionais de tremor em eventos intensos.

Modos de câmera adicionais poderão ser implementados posteriormente.

---

# 3. SISTEMA MUSICAL

## 3.1. Importação de áudio

O jogador poderá selecionar arquivos de áudio locais compatíveis com os formatos suportados pelo navegador.

O processamento deverá ocorrer localmente, sem necessidade de enviar o arquivo para servidores.

A primeira versão terá suporte prioritário a arquivos MP3 e WAV, sujeito às capacidades de decodificação do navegador.

## 3.2. Análise musical

O sistema deverá extrair informações relevantes para a geração do percurso.

### Parâmetros principais

| Parâmetro | Aplicação |
|---|---|
| BPM estimado | Ritmo dos eventos |
| Batidas detectadas | Posicionamento de coletáveis |
| Energia sonora | Intensidade visual |
| Frequências graves | Pulsação e efeitos ambientais |
| Frequências médias | Animações e iluminação secundária |
| Frequências agudas | Partículas e detalhes luminosos |
| Variação de energia | Antecipação de transições |
| Seções musicais | Mudanças estruturais do cenário |

O sistema deverá distinguir características medidas diretamente do áudio de interpretações estimadas, como identificação de drops e seções.

## 3.3. Processamento antecipado

Antes de iniciar uma corrida, o jogo realizará uma análise preliminar da música.

Essa análise produzirá uma representação temporal contendo eventos musicais e valores de intensidade.

Exemplo conceitual:

- 00:00 — Início da música.
- 00:15 — Aumento gradual de energia.
- 00:30 — Entrada de batida recorrente.
- 01:00 — Transição intensa.
- 01:45 — Redução de energia.
- 02:15 — Novo aumento de intensidade.
- 03:00 — Encerramento.

Esses eventos serão utilizados como referências para a geração procedural.

A análise não precisará identificar corretamente o gênero musical para produzir uma experiência funcional.

## 3.4. Sincronização

O áudio será a referência temporal principal.

A posição dos coletáveis e eventos deverá ser calculada para que sua interação com o veículo coincida com os instantes musicais correspondentes.

O jogo deverá prever:

- Compensação de latência configurável.
- Janelas de precisão.
- Ajustes de sincronização.
- Tratamento de pausas e retomadas.
- Sincronização independente da taxa de quadros.

A geração visual não poderá alterar o andamento da música.

---

# 4. GERAÇÃO PROCEDURAL DA PISTA

## 4.1. Objetivo

Produzir estradas contínuas, variadas, visualmente interessantes e adequadas à jogabilidade.

A pista será construída por segmentos conectados, chamados *chunks*.

## 4.2. Geometria

Cada segmento poderá conter:

- Trechos retos.
- Curvas suaves.
- Curvas progressivas.
- Subidas e descidas.
- Ondulações.
- Túneis.
- Pontes.
- Trechos elevados.

A implementação inicial utilizará curvas matemáticas contínuas, como splines, para definir o eixo central da estrada.

A geometria será construída a partir desse eixo, mantendo largura e continuidade adequadas.

## 4.3. Regras de geração

A geração deverá obedecer a restrições de jogabilidade.

**Restrições obrigatórias:**

- Não produzir curvas incompatíveis com a velocidade.
- Não criar mudanças bruscas de inclinação.
- Não gerar descontinuidades entre segmentos.
- Manter área suficiente para manobras.
- Garantir visibilidade antecipada de obstáculos.
- Evitar padrões sem rota segura.
- Preservar estabilidade geométrica e visual.

A música poderá influenciar a intensidade do percurso, mas não deverá determinar diretamente curvas perigosas a partir de cada batida.

## 4.4. Geração determinística

Cada corrida utilizará uma semente procedural (*seed*).

A combinação de música, cenário, configurações e seed deverá permitir reproduzir o mesmo percurso quando necessário.

Benefícios:

- Testes reproduzíveis.
- Comparação de pontuações.
- Compartilhamento futuro de percursos.
- Depuração de problemas de geração.

## 4.5. Carregamento progressivo

O sistema deverá:

1. Manter segmentos ativos à frente do veículo.
2. Preparar novos segmentos antecipadamente.
3. Remover ou reutilizar segmentos já percorridos.
4. Evitar alocações excessivas.
5. Manter transições imperceptíveis.

Os cenários deverão acompanhar esse processo.

---

# 5. GERAÇÃO PROCEDURAL DE CENÁRIOS

## 5.1. Conceito

O ambiente será composto por biomas audiovisuais.

Cada bioma possuirá um conjunto próprio de modelos, materiais, iluminação, partículas e regras de distribuição.

A pista e o cenário serão sistemas separados, permitindo reutilizar uma mesma geometria em diferentes ambientes.

## 5.2. Biomas previstos

### Neon Dreams

Ambiente synthwave inspirado em estética retrô-futurista.

Elementos:

- Montanhas geométricas.
- Sóis gigantes.
- Grades luminosas.
- Estruturas neon.
- Horizontes coloridos.
- Paleta magenta, violeta e ciano.

### Cyber City

Metrópole futurista.

Elementos:

- Arranha-céus.
- Hologramas.
- Viadutos.
- Túneis iluminados.
- Painéis digitais.
- Arquitetura monumental.

### Ethereal Forest

Ambiente fantástico e contemplativo.

Elementos:

- Árvores gigantes.
- Vegetação luminosa.
- Névoa.
- Partículas suspensas.
- Rochas e estruturas naturais.
- Iluminação atmosférica.

### Cosmic Highway

Estradas em ambientes espaciais abstratos.

Elementos:

- Nebulosas.
- Estrelas.
- Planetas.
- Estruturas flutuantes.
- Plataformas suspensas.
- Efeitos luminosos cósmicos.

## 5.3. Variação ambiental

Cada bioma poderá variar:

- Densidade de objetos.
- Escala das estruturas.
- Paleta de cores.
- Intensidade de iluminação.
- Neblina.
- Partículas.
- Elementos de fundo.
- Animações.

As variações deverão ocorrer de maneira gradual, salvo em eventos especiais.

## 5.4. Eventos ambientais

Eventos ambientais serão acontecimentos visuais associados a momentos importantes da música.

Exemplos:

- Surgimento de uma estrutura monumental.
- Abertura de um túnel luminoso.
- Mudança da cor do céu.
- Transição entre ambientes.
- Explosão sincronizada de partículas.
- Iluminação de estruturas próximas.
- Entrada em uma região espacial.

Esses eventos deverão ser planejados antecipadamente e executados em momentos musicais específicos.

## 5.5. Transições

A passagem entre estados ambientais deverá ocorrer por interpolação de parâmetros ou por estruturas de transição.

Exemplos:

- Túneis que escondem mudanças de cenário.
- Alterações graduais de iluminação.
- Transições de névoa.
- Mudanças progressivas de vegetação e arquitetura.

Mudanças instantâneas serão reservadas para momentos de forte impacto audiovisual.

---

# 6. SISTEMA DE RITMO E PONTUAÇÃO

## 6.1. Coletáveis

O principal elemento de interação será um objeto luminoso distribuído pela pista.

Os coletáveis deverão aparecer em padrões relacionados às batidas detectadas.

Tipos iniciais:

**Nota comum:** concede pontos quando coletada.

**Nota especial:** concede pontos adicionais ou ativa um efeito temporário.

**Sequência rítmica:** conjunto de notas organizado para estimular movimentação contínua.

## 6.2. Posicionamento

A distribuição de coletáveis deverá considerar:

- Tempo musical.
- Velocidade do veículo.
- Largura da pista.
- Capacidade de deslocamento lateral.
- Posição das notas anteriores.
- Dificuldade selecionada.

Um validador deverá impedir sequências impossíveis.

## 6.3. Pontuação

Sistema inicial proposto:

| Evento | Pontos-base |
|---|---:|
| Nota comum | 100 |
| Nota especial | 250 |
| Sequência perfeita | Bônus variável |

Esses valores são provisórios e deverão ser ajustados durante testes.

## 6.4. Combos

Coletas consecutivas aumentam o multiplicador de pontuação.

Proposta inicial:

- 0–9 notas: x1.
- 10–24 notas: x2.
- 25–49 notas: x3.
- 50 ou mais notas: x4.

A perda de uma nota obrigatória interrompe o combo no modo competitivo.

No modo contemplativo, o sistema de combo poderá ser desativado.

## 6.5. Obstáculos

Obstáculos poderão aparecer em dificuldades superiores.

Tipos possíveis:

- Barreiras.
- Estruturas parcialmente bloqueando a pista.
- Zonas perigosas.
- Objetos móveis previsíveis.

Os obstáculos deverão ser claramente distinguíveis dos coletáveis.

No protótipo inicial, serão opcionais e não causarão encerramento da corrida.

## 6.6. Colisões

Uma colisão poderá provocar:

- Redução temporária de velocidade.
- Perda do combo.
- Efeito visual de impacto.
- Penalidade de pontuação.

O jogador não deverá ser obrigado a reiniciar a música por uma única colisão.

---

# 7. MODOS DE JOGO

## 7.1. Rhythm Run

Modo competitivo principal.

Características:

- Coletáveis sincronizados.
- Pontuação.
- Combos.
- Obstáculos opcionais.
- Classificação final.
- Recordes locais.

O objetivo é alcançar a maior pontuação possível.

## 7.2. Free Ride

Modo contemplativo.

Características:

- Ausência de pontuação obrigatória.
- Obstáculos desativados.
- Direção livre dentro dos limites da pista.
- Maior foco na apresentação visual.
- Configuração de câmera e efeitos.

O objetivo é aproveitar a música e o ambiente.

## 7.3. Modos futuros

Possibilidades para versões posteriores:

- Endless Run: percurso contínuo com músicas sucessivas.
- Time Attack: desafios de precisão e velocidade.
- Zen Mode: experiência visual com controles mínimos.
- Challenge Mode: objetivos específicos por sessão.

Esses modos não integram o escopo inicial.

---

# 8. VEÍCULOS E PERSONALIZAÇÃO

## 8.1. Veículos

A primeira versão utilizará um veículo principal.

Posteriormente, poderão existir diferentes modelos, como:

- Esportivo futurista.
- Supercarro retrô.
- Motocicleta.
- Veículo flutuante.
- Protótipo de corrida.

As diferenças serão inicialmente estéticas, preservando condições equivalentes de pontuação.

## 8.2. Personalização

Opções previstas:

- Cor da carroceria.
- Materiais.
- Iluminação inferior.
- Trilhas luminosas.
- Partículas.
- Rodas.
- Efeitos especiais.

## 8.3. Progressão

O jogador poderá desbloquear elementos cosméticos por meio de desafios e pontuação acumulada.

Não haverá vantagens competitivas associadas à progressão.

---

# 9. DIREÇÃO DE ARTE

## 9.1. Estilo visual

O jogo utilizará uma estética 3D estilizada, combinando:

- Geometria relativamente simples.
- Cores saturadas.
- Materiais emissivos.
- Contrastes luminosos.
- Silhuetas marcantes.
- Efeitos de pós-processamento.

A prioridade será criar cenários expressivos sem depender de modelos excessivamente detalhados.

## 9.2. Iluminação

A iluminação deverá reforçar o ritmo musical.

Elementos previstos:

- Luzes dinâmicas controladas.
- Materiais emissivos.
- Bloom configurável.
- Névoa atmosférica.
- Gradientes de céu.
- Mudanças graduais de cor.

Os efeitos deverão possuir limites de intensidade e opções de acessibilidade.

## 9.3. Interface

A interface durante a corrida será minimalista.

Elementos principais:

- Pontuação.
- Multiplicador.
- Indicador de progresso musical.
- Informações discretas de combo.
- Feedback visual de coleta.

A interface não deverá obstruir a visualização da estrada.

---

# 10. EXPERIÊNCIA DO USUÁRIO

## 10.1. Menu principal

Opções previstas:

- Jogar.
- Selecionar música.
- Garagem.
- Configurações.
- Recordes.

## 10.2. Preparação da corrida

Fluxo:

1. Importar ou selecionar música.
2. Aguardar análise.
3. Escolher cenário.
4. Escolher modo.
5. Configurar dificuldade.
6. Iniciar corrida.

O tempo de preparação deverá ser minimizado por meio de cache de análises quando tecnicamente viável.

## 10.3. Tela de resultados

Informações previstas:

- Pontuação total.
- Maior combo.
- Notas coletadas.
- Precisão estimada.
- Classificação.
- Melhor pontuação anterior.

A tela permitirá reiniciar a mesma corrida ou gerar outra variação.

---

# 11. ARQUITETURA TÉCNICA

## 11.1. Stack

**Linguagem:** TypeScript  
**Renderização:** Three.js / WebGL  
**Interface:** React  
**Build:** Vite  
**Áudio:** Web Audio API  
**Armazenamento:** IndexedDB e armazenamento local quando apropriado.

## 11.2. Módulos principais

### Audio Engine

Responsável por:

- Carregamento.
- Reprodução.
- Controle temporal.
- Pausa e retomada.
- Volume.
- Sincronização.

### Music Analyzer

Responsável por:

- Análise espectral.
- Detecção de transientes.
- Estimativa de batidas.
- Estimativa de BPM.
- Extração de energia.
- Geração de eventos temporais.

### Track Generator

Responsável por:

- Geometria procedural.
- Curvatura.
- Elevação.
- Segmentação.
- Validação de continuidade.
- Reutilização de segmentos.

### World Generator

Responsável por:

- Biomas.
- Objetos ambientais.
- Iluminação.
- Partículas.
- Transições.
- Eventos visuais.

### Vehicle Controller

Responsável por:

- Movimentação.
- Direção.
- Limites da pista.
- Animação.
- Interações.
- Colisões.

### Rhythm System

Responsável por:

- Distribuição de notas.
- Janelas de interação.
- Combos.
- Pontuação.
- Validação de padrões.

### Game Director

Responsável pela coordenação geral dos sistemas.

Receberá eventos da análise musical e organizará sua tradução em acontecimentos jogáveis e visuais.

Esse módulo não deverá substituir as responsabilidades específicas dos demais sistemas.

## 11.3. Pipeline conceitual

**Arquivo de áudio → Análise musical → Linha temporal de eventos → Planejamento do percurso → Geração de pista e cenário → Execução sincronizada → Resultados.**

## 11.4. Performance

Metas iniciais:

- Alvo de 60 FPS em computadores desktop de referência.
- Suporte a ajustes gráficos.
- Reutilização de objetos.
- Instanced meshes para elementos repetidos.
- Descarregamento de segmentos distantes.
- Redução de draw calls.
- Limitação de partículas.
- Controle de efeitos de pós-processamento.

As especificações mínimas de hardware serão definidas após os primeiros testes.

---

# 12. REQUISITOS DE QUALIDADE

## 12.1. Jogabilidade

- Controles responsivos.
- Curvas previsíveis.
- Ausência de obstáculos inevitáveis.
- Padrões de notas executáveis.
- Feedback claro de coleta.
- Sincronização estável.

## 12.2. Geração procedural

- Continuidade geométrica.
- Ausência de buracos na pista.
- Ausência de objetos bloqueando indevidamente a trajetória.
- Reprodutibilidade por seed.
- Variedade visual suficiente.
- Carregamento sem interrupções perceptíveis.

## 12.3. Áudio

- Reprodução sem interrupções durante o jogo.
- Sincronização temporal estável.
- Tratamento de arquivos inválidos.
- Mensagens claras em caso de falha.
- Ajuste de latência.

## 12.4. Acessibilidade

- Controle de intensidade de efeitos.
- Redução de flashes.
- Desativação de tremor de câmera.
- Ajuste de sensibilidade.
- Configuração de volume.
- Modos de dificuldade.

---

# 13. ROADMAP DE DESENVOLVIMENTO

## Fase 1 — Protótipo de direção

Objetivo: validar a experiência básica de condução.

Entregas:

- Cena 3D.
- Veículo.
- Câmera.
- Pista contínua.
- Direção lateral.
- Geração de segmentos.
- Sistema de descarregamento.

**Critério de conclusão:** o jogador consegue dirigir continuamente sem falhas geométricas ou problemas graves de controle.

## Fase 2 — Integração musical

Objetivo: transformar uma música em uma sessão jogável.

Entregas:

- Importação de áudio.
- Reprodução.
- Análise de energia.
- Detecção básica de batidas.
- Linha temporal musical.
- Eventos sincronizados.

**Critério de conclusão:** o jogo responde de forma perceptível e temporalmente coerente à música.

## Fase 3 — Jogabilidade rítmica

Objetivo: adicionar desafio e pontuação.

Entregas:

- Coletáveis.
- Padrões.
- Colisões.
- Combos.
- Pontuação.
- Tela de resultados.

**Critério de conclusão:** o jogador consegue concluir uma música e receber uma pontuação consistente.

## Fase 4 — Cenário procedural

Objetivo: consolidar a identidade audiovisual.

Entregas:

- Bioma Neon Dreams.
- Objetos procedurais.
- Iluminação dinâmica.
- Partículas.
- Eventos ambientais.
- Transições.

**Critério de conclusão:** o cenário apresenta variação perceptível e responde à música sem prejudicar a jogabilidade.

## Fase 5 — Vertical Slice

Objetivo: integrar os sistemas em uma experiência completa.

Entregas:

- Menu principal.
- Seleção de música.
- Seleção de modo.
- Rhythm Run.
- Free Ride.
- Configurações.
- Resultados.
- Otimização inicial.

**Critério de conclusão:** uma pessoa consegue iniciar, jogar e concluir uma sessão completa sem assistência.

## Fase 6 — Expansão

Possibilidades:

- Novos biomas.
- Novos veículos.
- Personalização.
- Progressão.
- Desafios.
- Refinamento musical.
- Recursos de compartilhamento.

---

# 14. MVP — ESCOPO MÍNIMO

A primeira versão jogável deverá conter:

| Sistema | Escopo mínimo |
|---|---|
| Veículos | 1 |
| Cenários | 1 bioma |
| Pista | Procedural contínua |
| Música | Importação local |
| Análise | Energia e batidas básicas |
| Direção | Arcade lateral |
| Coletáveis | 1 tipo |
| Pontuação | Pontos e combo |
| Modos | Rhythm Run básico |
| Interface | Menu, HUD e resultados |
| Plataforma | Navegador desktop |

Não fazem parte do MVP:

- Multiplayer.
- Contas de usuário.
- Rankings online.
- Inteligência artificial de trânsito.
- Física automotiva realista.
- Editor de pistas.
- Aplicativos mobile nativos.
- Sistemas complexos de economia.
- Geração de cenários por inteligência artificial.

---

# 15. RISCOS E DESAFIOS

## 15.1. Análise musical imprecisa

**Risco:** músicas com ritmos complexos podem produzir eventos mal sincronizados.

**Mitigação:** combinar análise antecipada, limiares adaptativos e mecanismos de fallback para detecção pouco confiável.

## 15.2. Geração de pistas injustas

**Risco:** curvas e coletáveis podem exigir movimentos impossíveis.

**Mitigação:** impor restrições geométricas e validar padrões com base nas capacidades do veículo.

## 15.3. Queda de desempenho

**Risco:** cenários densos e efeitos visuais podem prejudicar a fluidez.

**Mitigação:** geometria instanciada, pooling, descarregamento de segmentos e configurações gráficas.

## 15.4. Monotonia

**Risco:** a geração procedural pode produzir variedade superficial, mas pouca diversidade de experiências.

**Mitigação:** introduzir eventos marcantes, mudanças de composição visual, sequências de gameplay e regras específicas por bioma.

## 15.5. Excesso de estímulos

**Risco:** efeitos visuais podem prejudicar a leitura da pista.

**Mitigação:** hierarquia visual clara, separação entre elementos decorativos e interativos, limites de luminosidade e opções de acessibilidade.

---

# 16. CRITÉRIOS DE SUCESSO

O primeiro protótipo será considerado bem-sucedido quando demonstrar que:

1. A condução é agradável mesmo sem música.
2. A estrada pode ser gerada continuamente sem interrupções.
3. A integração musical é perceptível e consistente.
4. Os coletáveis são legíveis e alcançáveis.
5. O cenário reage à música sem prejudicar a visibilidade.
6. A experiência permanece fluida durante uma música completa.
7. O jogador percebe diferenças entre músicas e entre sementes procedurais.
8. Existe motivação para repetir uma sessão.

---

# 17. DECISÕES EM ABERTO

As seguintes decisões deverão ser validadas antes da implementação definitiva:

**D01 — Controle:** confirmar a direção lateral contínua como modelo principal.

**D02 — Velocidade:** definir se será fixa, variável automaticamente ou parcialmente controlável.

**D03 — Música:** determinar os formatos suportados e a estratégia de análise antecipada.

**D04 — Geração:** estabelecer a relação exata entre estrutura musical, curvatura e eventos.

**D05 — Colisões:** definir penalidades e comportamento dos obstáculos.

**D06 — Dificuldade:** determinar níveis e critérios de ajuste.

**D07 — Cenários:** confirmar Neon Dreams como bioma inicial.

**D08 — Progressão:** definir se haverá desbloqueios na primeira versão pública.

**D09 — Persistência:** estabelecer como serão armazenadas análises, seeds e pontuações.

**D10 — Identidade:** confirmar o nome comercial e a direção visual definitiva.

---

# 18. DIRETRIZ FINAL

*Infinite Frequency* deverá ser desenvolvido de maneira incremental, com módulos independentes e responsabilidades claras.

O projeto não deve começar pela criação de múltiplos cenários, veículos ou efeitos complexos.

A prioridade será validar três fundamentos:

**Uma direção agradável, uma estrada procedural confiável e uma integração musical convincente.**

Esses três sistemas constituirão a base para a expansão do jogo.

**Fim do GDD — Versão 1.0.**
