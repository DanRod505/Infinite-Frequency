import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Records } from '../../rhythm/Records';
import { DIFFICULTY_LABELS, type Difficulty, type GameMode } from '../../rhythm/types';
import { GaragePanel, Segmented, SettingsPanel, Toggle } from './components';
import { useDeps, useMenuState, useSettings } from './context';
import { formatTime, percent, randomSeed } from './types';

function Card(props: { children: ReactNode; className?: string; label: string }) {
  return (
    <section className={`menu-card ${props.className ?? ''}`} aria-label={props.label}>
      {props.children}
    </section>
  );
}

/** GDD §10.1: Jogar, Garagem, Configurações, Recordes (+ Como jogar). */
export function MainMenu() {
  const { actions } = useDeps();
  return (
    <Card label="Menu principal">
      <h1 className="menu-title">
        Infinite <span>Frequency</span>
      </h1>
      <p className="menu-subtitle">Transforme sua música em uma viagem.</p>
      <nav className="menu-stack">
        <button className="primary big" autoFocus onClick={() => actions.navigate('play')}>
          Jogar
        </button>
        <button onClick={() => actions.navigate('garage')}>Garagem</button>
        <button onClick={() => actions.navigate('records')}>Recordes</button>
        <button onClick={() => actions.navigate('settings')}>Configurações</button>
        <button onClick={() => actions.navigate('howto')}>Como jogar</button>
      </nav>
    </Card>
  );
}

/** Song selection: import, library, demo or no music (GDD §10.2 step 1). */
export function PlayScreen() {
  const { actions } = useDeps();
  const { library, error } = useMenuState();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) actions.importFile(file);
  };

  return (
    <Card label="Selecionar música">
      <h2>Selecionar música</h2>
      <div
        className={dragging ? 'dropzone dropzone--active' : 'dropzone'}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Arraste um arquivo de áudio aqui</p>
        <button className="primary" autoFocus onClick={() => input.current?.click()}>
          Escolher música
        </button>
        <small>MP3, WAV, OGG… (o que o navegador decodificar). O arquivo não sai do seu computador.</small>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac"
          hidden
          data-file
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) actions.importFile(file);
          }}
        />
      </div>
      {error && <p className="menu-error">{error}</p>}

      {library.length > 0 && (
        <div className="library">
          <h3>Suas músicas</h3>
          <ul>
            {library.map((song) => (
              <li key={song.id}>
                <button className="library-play" onClick={() => actions.playLibrarySong(song.id)}>
                  <span className="library-title">{song.title}</span>
                  <small>{formatTime(song.duration)}</small>
                </button>
                <button className="library-remove" aria-label={`Remover ${song.title}`} title="Remover da biblioteca" onClick={() => actions.removeLibrarySong(song.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="menu-row">
        <button data-action="demo" onClick={() => actions.playDemo()}>
          Faixa de demonstração
        </button>
        <button data-action="free-drive" onClick={() => actions.freeDrive()}>
          Dirigir sem música
        </button>
        <button className="ghost" onClick={() => actions.back()}>
          Voltar
        </button>
      </div>
    </Card>
  );
}

export function LoadingScreen() {
  const { loading } = useMenuState();
  if (!loading) return null;
  return (
    <Card label="Analisando">
      <h2>{loading.title}</h2>
      <p>{loading.status}</p>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(loading.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.round(loading.progress * 100)}%` }} />
      </div>
    </Card>
  );
}

/** Song summary, mode, difficulty and seed (GDD §10.2 steps 3–6). */
export function ReadyScreen() {
  const { actions, settings, records } = useDeps();
  const { ready } = useMenuState();
  const v = useSettings();
  const [seed, setSeed] = useState(String(ready?.seed ?? randomSeed()));
  useEffect(() => setSeed(String(ready?.seed ?? randomSeed())), [ready?.seed]);
  if (!ready) return null;

  const a = ready.analysis;
  const levels = { low: 'calma', mid: 'média', high: 'intensa' };
  const obstacles = v.obstacles && v.difficulty !== 'easy';
  const record = v.mode === 'rhythm' ? records.get(Records.key(ready.songId, v.difficulty, obstacles)) : null;
  const start = () => {
    const parsed = Number.parseInt(seed, 10);
    actions.start(Number.isFinite(parsed) && parsed >= 0 ? parsed >>> 0 : randomSeed());
  };

  return (
    <Card label="Preparar corrida">
      <h2>{ready.title}</h2>
      <dl className="menu-details">
        <dt>Duração</dt>
        <dd>{formatTime(a.duration)}</dd>
        <dt>Andamento</dt>
        <dd>
          {a.tempo.reliable ? (
            <>
              {a.tempo.bpm.toFixed(1)} BPM <small>(estimado · confiança {percent(a.tempo.confidence)})</small>
            </>
          ) : (
            <>
              Pulso não identificado <small>(usando transientes)</small>
            </>
          )}
        </dd>
        <dt>Seções</dt>
        <dd>{a.sections.map((s) => levels[s.level]).join(' → ')}</dd>
        <dt>Drops</dt>
        <dd>
          {a.drops.length > 0 ? a.drops.map(formatTime).join(', ') : 'nenhum'} <small>(estimado)</small>
        </dd>
        {ready.cached && (
          <>
            <dt>Análise</dt>
            <dd>recuperada do cache</dd>
          </>
        )}
      </dl>

      <div className="run-options" data-run-options>
        <Segmented<GameMode>
          legend="Modo"
          value={v.mode}
          options={[
            { value: 'rhythm', label: 'Rhythm Run', hint: 'notas, combos e pontuação' },
            { value: 'free', label: 'Free Ride', hint: 'só a música e a estrada' },
          ]}
          onChange={(mode) => settings.update({ mode })}
        />
        {v.mode === 'rhythm' && (
          <>
            <Segmented<Difficulty>
              legend="Dificuldade"
              value={v.difficulty}
              options={(['easy', 'normal', 'hard'] as const).map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] }))}
              onChange={(difficulty) => settings.update({ difficulty })}
            />
            <Toggle
              label="Obstáculos"
              hint="(Normal e Difícil)"
              checked={v.obstacles}
              disabled={v.difficulty === 'easy'}
              onChange={(value) => settings.update({ obstacles: value })}
            />
            <p className="record-line">{record ? `Recorde: ${record.score.toLocaleString('pt-BR')} (${record.rank})` : ''}</p>
          </>
        )}
      </div>

      <label className="seed">
        Seed do percurso
        <span>
          <input type="number" min={0} step={1} value={seed} data-seed onChange={(e) => setSeed(e.target.value)} />
          <button type="button" title="Seed aleatória" aria-label="Seed aleatória" onClick={() => setSeed(String(randomSeed()))}>
            🎲
          </button>
        </span>
      </label>
      <div className="menu-row">
        <button className="ghost" onClick={() => actions.back()}>
          Voltar
        </button>
        <button className="primary" autoFocus data-action="start" onClick={start}>
          Iniciar corrida
        </button>
      </div>
    </Card>
  );
}

/** Explains the game before the first Rhythm Run, and from the main menu. */
export function HowToScreen() {
  const { actions } = useDeps();
  const { pendingStart } = useMenuState();
  return (
    <Card label="Como jogar" className="menu-card--wide">
      <h2>Como jogar</h2>
      <div className="howto">
        <div>
          <h3>Dirigir</h3>
          <p>
            O carro acelera sozinho. Use <kbd>A</kbd>/<kbd>D</kbd> ou <kbd>←</kbd>/<kbd>→</kbd> para se mover para os lados. Esc pausa.
          </p>
        </div>
        <div>
          <h3>Coletar</h3>
          <p>
            As <b className="note-white">gemas brancas</b> chegam no ritmo da música: passe por cima delas. As <b className="note-gold">douradas</b>{' '}
            valem mais.
          </p>
        </div>
        <div>
          <h3>Combos</h3>
          <p>Coletas seguidas aumentam o multiplicador até x4. Perder uma nota zera o combo. Sequências completas dão bônus.</p>
        </div>
        <div>
          <h3>Desviar</h3>
          <p>
            Barreiras <b className="note-red">listradas de vermelho</b> quebram o combo e tiram pontos. Sempre existe um caminho livre entre as notas.
          </p>
        </div>
        <div>
          <h3>Sincronia</h3>
          <p>
            Se as pulsações parecerem fora do tempo da música, ajuste a latência em Configurações ou com <kbd>[</kbd>/<kbd>]</kbd> durante a corrida.
          </p>
        </div>
        <div>
          <h3>Sua música</h3>
          <p>Importe qualquer arquivo de áudio: ele é analisado no seu navegador e fica salvo em "Suas músicas" para jogar de novo.</p>
        </div>
      </div>
      <div className="menu-row">
        {pendingStart !== null ? (
          <button className="primary" autoFocus onClick={() => actions.confirmHowTo()}>
            Entendi, começar!
          </button>
        ) : (
          <button className="primary" autoFocus onClick={() => actions.back()}>
            Voltar
          </button>
        )}
      </div>
    </Card>
  );
}

export function PauseScreen() {
  const { actions } = useDeps();
  return (
    <Card label="Pausado">
      <h2>Pausado</h2>
      <nav className="menu-stack">
        <button className="primary" autoFocus data-action="resume" onClick={() => actions.resume()}>
          Continuar
        </button>
        <button data-action="restart" onClick={() => actions.restart()}>
          Reiniciar
        </button>
        <button onClick={() => actions.navigate('settings')}>Configurações</button>
        <button data-action="menu" onClick={() => actions.quitToMenu()}>
          Menu principal
        </button>
      </nav>
    </Card>
  );
}

export function SettingsScreen() {
  const { actions } = useDeps();
  return (
    <Card label="Configurações" className="menu-card--wide">
      <h2>Configurações</h2>
      <SettingsPanel />
      <div className="menu-row">
        <button className="primary" autoFocus onClick={() => actions.back()}>
          Voltar
        </button>
      </div>
    </Card>
  );
}

export function GarageScreen() {
  const { actions } = useDeps();
  return (
    <Card label="Garagem" className="menu-card--side">
      <h2>Garagem</h2>
      <GaragePanel />
      <div className="menu-row">
        <button className="primary" autoFocus onClick={() => actions.back()}>
          Voltar
        </button>
      </div>
    </Card>
  );
}

export function RecordsScreen() {
  const { actions, records } = useDeps();
  const [, refresh] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const list = records.list();
  return (
    <Card label="Recordes" className="menu-card--wide">
      <h2>Recordes</h2>
      {list.length === 0 ? (
        <p className="menu-subtitle">Nenhum recorde ainda. Termine uma corrida no Rhythm Run para registrar o primeiro.</p>
      ) : (
        <table className="records">
          <thead>
            <tr>
              <th>Música</th>
              <th>Dificuldade</th>
              <th>Pontos</th>
              <th>Nota</th>
              <th>Combo</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.key}>
                <td className="records-title">{r.title}</td>
                <td>
                  {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}
                  {r.obstacles && <small> · obstáculos</small>}
                </td>
                <td>{r.score.toLocaleString('pt-BR')}</td>
                <td>
                  <span className="rank-badge" data-rank={r.rank}>
                    {r.rank}
                  </span>
                </td>
                <td>{r.maxCombo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="menu-row">
        <button className="primary" autoFocus onClick={() => actions.back()}>
          Voltar
        </button>
        {list.length > 0 &&
          (confirming ? (
            <button
              className="danger"
              onClick={() => {
                actions.clearRecords();
                setConfirming(false);
                refresh((n) => n + 1);
              }}
            >
              Confirmar: apagar todos
            </button>
          ) : (
            <button className="ghost" onClick={() => setConfirming(true)}>
              Limpar recordes
            </button>
          ))}
      </div>
    </Card>
  );
}

/** GDD §10.3. */
export function ResultsScreen() {
  const { actions } = useDeps();
  const { results } = useMenuState();
  if (!results) return null;
  const { summary, record } = results;
  const r = summary.rhythm?.score;
  return (
    <Card label="Resultados" className="menu-card--wide">
      <h2>Música concluída</h2>
      <p className="menu-subtitle">{summary.title}</p>
      {r && summary.rhythm && (
        <div className="results-score">
          <div className="rank" data-rank={r.rank}>
            {r.rank}
          </div>
          <div>
            <div className="results-points">{r.score.toLocaleString('pt-BR')}</div>
            <div className={record?.isNewBest ? 'results-record results-record--new' : 'results-record'}>
              {record?.isNewBest
                ? record.previous
                  ? `Novo recorde! (anterior: ${record.previous.score.toLocaleString('pt-BR')})`
                  : 'Primeiro recorde!'
                : record?.previous
                  ? `Recorde: ${record.previous.score.toLocaleString('pt-BR')} (${record.previous.rank})`
                  : ''}
            </div>
          </div>
        </div>
      )}
      <dl className="menu-details">
        {r && summary.rhythm && (
          <>
            <dt>Dificuldade</dt>
            <dd>
              {DIFFICULTY_LABELS[summary.rhythm.difficulty]}
              {summary.rhythm.obstacles && summary.rhythm.difficulty !== 'easy' ? ' · com obstáculos' : ''}
            </dd>
            <dt>Notas</dt>
            <dd>
              {r.collected} / {r.totalNotes} <small>({percent(r.totalNotes > 0 ? r.collected / r.totalNotes : 0)})</small>
            </dd>
            <dt>Perfeitas</dt>
            <dd>{r.perfects}</dd>
            <dt>Maior combo</dt>
            <dd>{r.maxCombo}</dd>
            <dt>Precisão</dt>
            <dd>
              {percent(r.precision)} <small>(estimada)</small>
            </dd>
            <dt>Colisões</dt>
            <dd>{r.obstaclesHit}</dd>
          </>
        )}
        <dt>Duração</dt>
        <dd>{formatTime(summary.duration)}</dd>
        <dt>Distância</dt>
        <dd>{(summary.distance / 1000).toFixed(2)} km</dd>
        <dt>Andamento</dt>
        <dd>{summary.bpm > 0 ? `${summary.bpm.toFixed(1)} BPM` : '—'}</dd>
        <dt>Seed</dt>
        <dd>{summary.seed}</dd>
      </dl>
      <div className="menu-row" data-screen-results>
        <button className="primary" autoFocus data-action="restart" onClick={() => actions.restart()}>
          Repetir percurso
        </button>
        <button data-action="new-variation" onClick={() => actions.newVariation()}>
          Nova variação
        </button>
        <button data-action="menu" onClick={() => actions.quitToMenu()}>
          Menu principal
        </button>
      </div>
    </Card>
  );
}
