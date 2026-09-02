/**
 * El sonido de recompensa del platino.
 *
 * Se sintetiza con la Web Audio API en vez de traer un archivo. No es por
 * ahorrar: es que así el sonido **cae exactamente sobre la animación** —el
 * golpe con el estallido, el arpegio mientras las chispas se abren, la cola
 * brillante cuando el trofeo aterriza—, y ajustar un tiempo es cambiar un
 * número, no volver a editar un audio. Además no arrastra licencias de nadie
 * ni medio mega de wav.
 *
 * Todo el sonido cuelga de un único contexto que se crea la primera vez y se
 * reutiliza: abrir uno por celebración acabaría agotando los que permite el
 * navegador.
 */

let contexto: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  try {
    contexto ??= new AudioContext();
    // Si el sistema lo suspendió, se reanuda; si falla, no pasa nada.
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch {
    return null;
  }
}

interface Nota {
  /** Segundos desde el inicio. */
  en: number;
  hz: number;
  /** Duración de la cola. */
  largo: number;
  volumen: number;
  onda?: OscillatorType;
  /** Segundo armónico, que es lo que da el timbre de campana. */
  brillo?: number;
}

/**
 * Cuándo estalla la luz en el vídeo de la celebración. Todo lo demás se coloca
 * respecto a este instante, que es lo que hace que suene *con* la imagen y no
 * al lado. Si el vídeo cambia, se cambia este número y ya.
 */
export const ESTALLIDO_S = 3.25;

/**
 * Sol mayor subiendo, que es el acorde con el que suena a logro en medio mundo.
 * Los tiempos son relativos al estallido: las dos primeras notas caen con él y
 * las demás lo rematan hacia arriba mientras se abren las chispas.
 */
const ARPEGIO: Nota[] = [
  { en: 0.00, hz: 392.0, largo: 1.8, volumen: 0.16, brillo: 0.5 },  // sol4
  { en: 0.00, hz: 587.3, largo: 1.8, volumen: 0.13, brillo: 0.5 },  // re5
  { en: 0.16, hz: 784.0, largo: 1.6, volumen: 0.15, brillo: 0.45 }, // sol5
  { en: 0.30, hz: 987.8, largo: 1.6, volumen: 0.13, brillo: 0.4 },  // si5
  { en: 0.44, hz: 1174.7, largo: 1.9, volumen: 0.12, brillo: 0.35 },// re6
  { en: 0.60, hz: 1568.0, largo: 2.8, volumen: 0.11, brillo: 0.3 }, // sol6
];

/** Una campana: ataque instantáneo y caída exponencial, como al golpear metal. */
function campana(ctx: AudioContext, inicio: number, nota: Nota): void {
  const salida = ctx.createGain();
  salida.connect(ctx.destination);
  salida.gain.setValueAtTime(0.0001, inicio);
  salida.gain.exponentialRampToValueAtTime(nota.volumen, inicio + 0.012);
  salida.gain.exponentialRampToValueAtTime(0.0001, inicio + nota.largo);

  const tonos: [number, number][] = [[nota.hz, 1]];
  if (nota.brillo) tonos.push([nota.hz * 2, nota.brillo]);

  for (const [hz, peso] of tonos) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = nota.onda ?? 'sine';
    osc.frequency.setValueAtTime(hz, inicio);
    g.gain.setValueAtTime(peso, inicio);
    osc.connect(g);
    g.connect(salida);
    osc.start(inicio);
    osc.stop(inicio + nota.largo + 0.1);
  }
}

/** El golpe del estallido: un barrido grave y corto que da cuerpo. */
function golpe(ctx: AudioContext, inicio: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, inicio);
  osc.frequency.exponentialRampToValueAtTime(46, inicio + 0.45);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(0.3, inicio + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.5);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + 0.55);
}

/**
 * La subida previa: acompaña al trofeo mientras retrocede y se aleja, y va
 * tensando hasta el estallido. Dura lo que dura ese tramo del vídeo.
 */
function subida(ctx: AudioContext, inicio: number, largo: number): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(90, inicio);
  osc.frequency.exponentialRampToValueAtTime(460, inicio + largo);
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(0.02, inicio + largo * 0.35);
  g.gain.exponentialRampToValueAtTime(0.08, inicio + largo * 0.94);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + largo + 0.04);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(inicio);
  osc.stop(inicio + largo + 0.1);
}

/**
 * La cola de cristal: ruido muy filtrado y muy flojo que se apaga despacio.
 * Es lo que hace que el acorde no termine en seco.
 */
function brillo(ctx: AudioContext, inicio: number): void {
  const largo = 2.6;
  const muestras = Math.floor(ctx.sampleRate * largo);
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) {
    // Ruido que se desvanece; el filtro de después lo convierte en brillo.
    datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras) ** 3;
  }

  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.setValueAtTime(2600, inicio);
  filtro.frequency.exponentialRampToValueAtTime(6200, inicio + largo);
  filtro.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.05, inicio);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + largo);

  fuente.connect(filtro);
  filtro.connect(g);
  g.connect(ctx.destination);
  fuente.start(inicio);
  fuente.stop(inicio + largo);
}

/**
 * Suena la recompensa. Nunca lanza: si el equipo no tiene salida de audio o el
 * navegador bloquea el contexto, la celebración sigue viéndose igual.
 */
export function sonarPlatino(): void {
  const ctx = obtenerContexto();
  if (!ctx) return;
  try {
    const t = ctx.currentTime + 0.02;
    const estallido = t + ESTALLIDO_S;
    subida(ctx, t, ESTALLIDO_S);
    golpe(ctx, estallido);
    brillo(ctx, estallido + 0.02);
    for (const nota of ARPEGIO) campana(ctx, estallido + nota.en, nota);
  } catch {
    // Sin sonido, pero la fiesta continúa.
  }
}
