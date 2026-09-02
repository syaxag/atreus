"""Saca el trofeo de Atreus con transparencia real.

El original es un JPG y su "fondo transparente" es un tablero de ajedrez
dibujado encima. Quitarlo cuesta porque los cuadros claros son blanco puro y el
cristal del trofeo también tiene blanco puro, plano y neutro: ni el color, ni
la planitud, ni la conectividad por separado los distinguen.

Lo que sí los distingue es que **el tablero alterna**. Un trozo de fondo tiene,
a una casilla de distancia, otro trozo del tono contrario, y así por todas
partes. Un brillo del cristal no: a una casilla de distancia hay más cristal,
que no respeta la cuadrícula. Ese es el criterio que se usa para sembrar, y
desde esas semillas se inunda con conectividad de 8 —las casillas solo se tocan
en diagonal— para alcanzar los bordes parciales pegados al trofeo.

La cuadrícula no se modela con un periodo fijo: el de X y el de Y no coinciden y
la fase deriva a lo largo de las 2196 filas. Se lee de la propia imagen, que
deja margen de tablero puro por los cuatro lados.
"""
from collections import deque
import sys

from PIL import Image, ImageFilter

SRC = r'C:\Users\Syax_\Downloads\LOGO PLATINO.jpg'
OUT = sys.argv[1]
ALTO_FINAL = 1024

CLARO, MEDIO = 255, 201
CORTE = 228
TOL = 16          # para propagar, generoso
TOL_SEMILLA = 7   # para sembrar, estricto
NEUTRO = 12
MARGEN_SEAM = 3
BLOQUE = 16       # lado del trozo que se examina al sembrar

im = Image.open(SRC).convert('RGB')
w, h = im.size
px = im.load()

gris = lambda p: (p[0] + p[1] + p[2]) / 3


def banda(valores):
    claro = [v > CORTE for v in valores]
    junta = [False] * len(valores)
    for i in range(1, len(valores)):
        if claro[i] != claro[i - 1]:
            for j in range(max(0, i - MARGEN_SEAM), min(len(valores), i + MARGEN_SEAM)):
                junta[j] = True
    return claro, junta


def indices(claro):
    idx, actual = [0] * len(claro), 0
    for i in range(1, len(claro)):
        if claro[i] != claro[i - 1]:
            actual += 1
        idx[i] = actual
    return idx


claro_x, junta_x = banda([gris(px[x, 2]) for x in range(w)])
claro_y, junta_y = banda([gris(px[2, y]) for y in range(h)])
celda_x, celda_y = indices(claro_x), indices(claro_y)
base = (gris(px[2, 2]) > CORTE) ^ claro_x[2] ^ claro_y[2]

# Primer píxel de cada casilla, para saltar de una a la de al lado sin suponer
# un periodo constante.
inicio_x, inicio_y = {}, {}
for x in range(w):
    inicio_x.setdefault(celda_x[x], x)
for y in range(h):
    inicio_y.setdefault(celda_y[y], y)


def tono_de(x, y):
    return CLARO if (claro_x[x] ^ claro_y[y] ^ base) else MEDIO


def es_fondo(x, y):
    r, g, b = px[x, y]
    if max(r, g, b) - min(r, g, b) > NEUTRO:
        return False
    v = (r + g + b) / 3
    if junta_x[x] or junta_y[y]:
        return abs(v - CLARO) <= TOL or abs(v - MEDIO) <= TOL
    return abs(v - tono_de(x, y)) <= TOL


def trozo_liso(x, y):
    """El bloque que empieza en (x, y) es liso y del tono que le toca."""
    if x + BLOQUE > w or y + BLOQUE > h:
        return False
    if junta_x[x] or junta_y[y] or junta_x[x + BLOQUE - 1] or junta_y[y + BLOQUE - 1]:
        return False
    esperado = tono_de(x, y)
    n = tot = tot2 = 0
    for yy in range(y, y + BLOQUE, 2):
        for xx in range(x, x + BLOQUE, 2):
            r, g, b = px[xx, yy]
            if max(r, g, b) - min(r, g, b) > NEUTRO:
                return False
            v = (r + g + b) / 3
            if abs(v - esperado) > TOL_SEMILLA:
                return False
            tot += v
            tot2 += v * v
            n += 1
    media = tot / n
    return (max(0.0, tot2 / n - media * media)) ** 0.5 < 4


def alterna(x, y):
    """Hay tablero del tono contrario a una casilla de distancia."""
    cx, cy = celda_x[x], celda_y[y]
    dentro_x, dentro_y = x - inicio_x[cx], y - inicio_y[cy]
    for dcx, dcy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ncx, ncy = cx + dcx, cy + dcy
        if ncx not in inicio_x or ncy not in inicio_y:
            continue
        nx, ny = inicio_x[ncx] + dentro_x, inicio_y[ncy] + dentro_y
        if 0 <= nx < w - BLOQUE and 0 <= ny < h - BLOQUE and trozo_liso(nx, ny):
            return True
    return False



# ── El trofeo es UNA pieza: se queda su componente principal ──
# Enfocarlo desde el fondo no acababa de salir: quedaban bolsas de tablero
# encerradas entre las alas, que no se alcanzan desde el borde. Al revés sí
# funciona. El trofeo es un objeto conectado, así que se toma el componente
# mayor de "lo que no es fondo" y luego se decide hueco por hueco.
from collections import deque as _dq

cand = bytearray(1 if not es_fondo(x, y) else 0 for y in range(h) for x in range(w))
VECINOS = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))

etiqueta = [0] * (w * h)
mejor, mejor_n = 0, 0
n_etq = 0
for y0 in range(h):
    for x0 in range(w):
        i0 = y0 * w + x0
        if not cand[i0] or etiqueta[i0]:
            continue
        n_etq += 1
        n = 0
        pila = [(x0, y0)]
        etiqueta[i0] = n_etq
        while pila:
            x, y = pila.pop()
            n += 1
            for dx, dy in VECINOS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if cand[i] and not etiqueta[i]:
                        etiqueta[i] = n_etq
                        pila.append((nx, ny))
        if n > mejor_n:
            mejor, mejor_n = n_etq, n
print(f'componente del trofeo: {mejor_n} px de {n_etq} candidatos')

cuerpo = bytearray(1 if etiqueta[i] == mejor else 0 for i in range(w * h))

# ── Lo de fuera, inundando desde el borde ──
fuera = bytearray(w * h)
cola_f = _dq()
for x in range(w):
    for y in (0, h - 1):
        if not cuerpo[y * w + x] and not fuera[y * w + x]:
            fuera[y * w + x] = 1
            cola_f.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if not cuerpo[y * w + x] and not fuera[y * w + x]:
            fuera[y * w + x] = 1
            cola_f.append((x, y))
while cola_f:
    x, y = cola_f.popleft()
    for dx, dy in VECINOS:
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            i = ny * w + nx
            if not cuerpo[i] and not fuera[i]:
                fuera[i] = 1
                cola_f.append((nx, ny))

# ── Cada hueco: ¿tablero encerrado, o cristal mal clasificado? ──
# El tablero lleva los dos tonos; una zona de cristal que se parezca al fondo
# es de uno solo. Los huecos de tablero se dejan transparentes y los otros se
# rellenan, que es lo que devuelve al cristal sus brillos.
alfa = bytearray(cuerpo)
visto = bytearray(w * h)
huecos_tablero = huecos_rellenos = 0
for y0 in range(h):
    for x0 in range(w):
        i0 = y0 * w + x0
        if cuerpo[i0] or fuera[i0] or visto[i0]:
            continue
        grupo = []
        pila = [(x0, y0)]
        visto[i0] = 1
        claros = medios = 0
        while pila:
            x, y = pila.pop()
            grupo.append((x, y))
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) <= NEUTRO and not (junta_x[x] or junta_y[y]):
                v = (r + g + b) / 3
                if abs(v - CLARO) <= TOL:
                    claros += 1
                elif abs(v - MEDIO) <= TOL:
                    medios += 1
            for dx, dy in VECINOS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if not cuerpo[i] and not fuera[i] and not visto[i]:
                        visto[i] = 1
                        pila.append((nx, ny))
        n = claros + medios
        es_tablero = len(grupo) >= 120 and n > 0 and min(claros, medios) / n >= 0.12
        if es_tablero:
            huecos_tablero += 1
        else:
            huecos_rellenos += 1
            for x, y in grupo:
                alfa[y * w + x] = 1
print(f'huecos: {huecos_tablero} de tablero (transparentes), {huecos_rellenos} rellenados')

# ── Restos de tablero pegados al cuerpo ──
# Algunos trozos quedan unidos al trofeo por los píxeles de junta y el
# componente los absorbe. La marca que los delata sin lugar a dudas es el
# **gris 201 puro**: el trofeo es morado y blanco, y ese gris neutro exacto no
# aparece en ninguna faceta del cristal. Desde cada trozo de ese gris se
# extiende a los blancos pegados a él, que son las casillas claras del mismo
# resto.
def gris_de_tablero(x, y):
    r, g, b = px[x, y]
    return max(r, g, b) - min(r, g, b) <= 5 and abs((r + g + b) / 3 - MEDIO) <= 5


def blanco_de_tablero(x, y):
    r, g, b = px[x, y]
    return max(r, g, b) - min(r, g, b) <= 5 and (r + g + b) / 3 >= CLARO - 6


semillas = [(x, y) for y in range(h) for x in range(w)
            if alfa[y * w + x] and gris_de_tablero(x, y)]
print(f'gris de tablero dentro del cuerpo: {len(semillas)} px')

visto2 = bytearray(w * h)
pila = []
for x, y in semillas:
    i = y * w + x
    if not visto2[i]:
        visto2[i] = 1
        pila.append((x, y))

borrados = 0
while pila:
    x, y = pila.pop()
    alfa[y * w + x] = 0
    borrados += 1
    for dx, dy in VECINOS:
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h:
            i = ny * w + nx
            if alfa[i] and not visto2[i] and (gris_de_tablero(nx, ny) or blanco_de_tablero(nx, ny)):
                visto2[i] = 1
                pila.append((nx, ny))
print(f'restos de tablero limpiados del cuerpo: {borrados} px')

# ── Casillas blancas sueltas ──
# Las que no tocaban ningún gris no se alcanzaron en la pasada anterior. Se
# reconocen por la forma: un cuadro de tablero rellena por completo una caja
# cuadrada del tamaño de una casilla. Un brillo del cristal es irregular y no
# llena su caja, así que este filtro no le toca.
visto3 = bytearray(w * h)
cuadros = 0
for y0 in range(h):
    for x0 in range(w):
        i0 = y0 * w + x0
        if not alfa[i0] or visto3[i0] or not blanco_de_tablero(x0, y0):
            continue
        grupo = []
        pila = [(x0, y0)]
        visto3[i0] = 1
        while pila:
            x, y = pila.pop()
            grupo.append((x, y))
            for dx, dy in VECINOS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if alfa[i] and not visto3[i] and blanco_de_tablero(nx, ny):
                        visto3[i] = 1
                        pila.append((nx, ny))
        if len(grupo) < 2500:
            continue
        xs = [g[0] for g in grupo]
        ys = [g[1] for g in grupo]
        ancho, alto = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        if not (60 <= ancho <= 115 and 60 <= alto <= 115):
            continue
        if len(grupo) / (ancho * alto) < 0.82:
            continue
        cuadros += 1
        for x, y in grupo:
            alfa[y * w + x] = 0
print(f'casillas blancas sueltas quitadas: {cuadros}')

# ── Restos sueltos ──
# Tras todas las pasadas quedan fragmentos de casilla flotando, demasiado
# parciales para reconocerlos por forma. Da igual: el trofeo es **una sola
# pieza**, así que lo que no esté pegado a él sobra.
etq = [0] * (w * h)
mejor = mejor_n = n_etq = 0
for y0 in range(h):
    for x0 in range(w):
        i0 = y0 * w + x0
        if not alfa[i0] or etq[i0]:
            continue
        n_etq += 1
        n = 0
        pila = [(x0, y0)]
        etq[i0] = n_etq
        while pila:
            x, y = pila.pop()
            n += 1
            for dx, dy in VECINOS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    i = ny * w + nx
                    if alfa[i] and not etq[i]:
                        etq[i] = n_etq
                        pila.append((nx, ny))
        if n > mejor_n:
            mejor, mejor_n = n_etq, n
sueltos = sum(1 for i in range(w * h) if alfa[i] and etq[i] != mejor)
for i in range(w * h):
    if alfa[i] and etq[i] != mejor:
        alfa[i] = 0
print(f'fragmentos sueltos descartados: {sueltos} px en {n_etq - 1} trozos')

mask = Image.frombytes('L', (w, h), bytes(255 if v else 0 for v in alfa))
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))

out = im.copy()
out.putalpha(mask)
caja = mask.point(lambda v: 255 if v > 8 else 0).getbbox()
out = out.crop(caja)
escala = ALTO_FINAL / out.height
out = out.resize((round(out.width * escala), ALTO_FINAL), Image.LANCZOS)
out.save(OUT, 'PNG', optimize=True)
print('guardado', out.size)

for nombre, color in (('sobre-oscuro', (10, 10, 13)), ('sobre-magenta', (255, 0, 255))):
    prueba = Image.new('RGB', out.size, color)
    prueba.paste(out, (0, 0), out)
    prueba.save(OUT.replace('.png', f'-{nombre}.png'))
out.split()[3].save(OUT.replace('.png', '-alfa.png'))
