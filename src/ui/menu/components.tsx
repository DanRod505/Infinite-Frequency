import { useId, type ReactNode } from 'react';
import { BODY_COLORS, GLOW_COLORS, LATENCY_LIMIT_MS, STEERING_RANGE, type QualitySetting } from '../../core/Settings';
import { QUALITY_LABELS } from '../../game/Quality';
import { useDeps, useSettings } from './context';

export function Segmented<T extends string>(props: {
  legend: string;
  value: T;
  options: { value: T; label: string; hint?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented">
      <legend>{props.legend}</legend>
      {props.options.map((option) => (
        <label key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={props.value === option.value}
            disabled={option.disabled}
            onChange={() => props.onChange(option.value)}
          />
          <span>
            {option.label}
            {option.hint && <small>{option.hint}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        {props.label} <output>{props.display}</output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export function Toggle(props: { label: string; checked: boolean; hint?: string; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

export function Swatches(props: { legend: string; colors: readonly number[]; value: number; onChange: (color: number) => void }) {
  return (
    <fieldset className="swatches">
      <legend>{props.legend}</legend>
      {props.colors.map((color) => {
        const hex = `#${color.toString(16).padStart(6, '0')}`;
        return (
          <button
            key={color}
            type="button"
            className={props.value === color ? 'swatch swatch--active' : 'swatch'}
            style={{ background: hex }}
            aria-label={hex}
            aria-pressed={props.value === color}
            onClick={() => props.onChange(color)}
          />
        );
      })}
    </fieldset>
  );
}

export function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Every player setting (GDD §12.3, §12.4, §11.4), grouped by topic. */
export function SettingsPanel() {
  const { settings } = useDeps();
  const v = useSettings();
  const update = settings.update.bind(settings);
  return (
    <div className="settings-panel">
      <Section title="Áudio">
        <Slider label="Volume da música" value={v.volume} min={0} max={1} step={0.05} display={pct(v.volume)} onChange={(volume) => update({ volume })} />
        <Slider
          label="Efeitos sonoros"
          value={v.sfxVolume}
          min={0}
          max={1}
          step={0.05}
          display={pct(v.sfxVolume)}
          onChange={(sfxVolume) => update({ sfxVolume })}
        />
        <Slider
          label="Latência"
          value={v.latencyMs}
          min={-LATENCY_LIMIT_MS}
          max={LATENCY_LIMIT_MS}
          step={5}
          display={`${v.latencyMs > 0 ? '+' : ''}${v.latencyMs} ms`}
          hint="Se as pulsações parecerem adiantadas em relação ao som, aumente. Durante a corrida: teclas [ e ]."
          onChange={(latencyMs) => update({ latencyMs })}
        />
      </Section>
      <Section title="Gráficos">
        <Segmented<QualitySetting>
          legend="Qualidade"
          value={v.quality}
          options={(['auto', 'low', 'medium', 'high'] as const).map((q) => ({ value: q, label: QUALITY_LABELS[q] }))}
          onChange={(quality) => update({ quality })}
        />
        <small className="hint">Automática começa em Alta e reduz sozinha se o jogo ficar lento.</small>
        <Slider
          label="Intensidade dos efeitos"
          value={v.effects}
          min={0}
          max={1}
          step={0.05}
          display={pct(v.effects)}
          onChange={(effects) => update({ effects })}
        />
      </Section>
      <Section title="Acessibilidade e controle">
        <Toggle label="Reduzir flashes" checked={v.reduceFlashes} onChange={(reduceFlashes) => update({ reduceFlashes })} />
        <Toggle label="Tremor de câmera" checked={v.cameraShake} onChange={(cameraShake) => update({ cameraShake })} />
        <Slider
          label="Sensibilidade da direção"
          value={v.steering}
          min={STEERING_RANGE[0]}
          max={STEERING_RANGE[1]}
          step={0.05}
          display={pct(v.steering)}
          hint="Quão rápido o carro responde às teclas. Todas as notas continuam alcançáveis."
          onChange={(steering) => update({ steering })}
        />
      </Section>
    </div>
  );
}

/** Garage options (GDD §8.2). */
export function GaragePanel() {
  const { settings } = useDeps();
  const v = useSettings();
  return (
    <div className="settings-panel">
      <Swatches legend="Carroceria" colors={BODY_COLORS} value={v.bodyColor} onChange={(bodyColor) => settings.update({ bodyColor })} />
      <Swatches legend="Luz inferior e rodas" colors={GLOW_COLORS} value={v.glowColor} onChange={(glowColor) => settings.update({ glowColor })} />
      <small className="hint">Personalizações são apenas visuais: nenhuma dá vantagem na pontuação.</small>
    </div>
  );
}
