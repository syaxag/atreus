import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLanguage, parseGuideDocument, parseGuideList, parseRating, richText,
} from '../src/main/services/guides/parse-steam.ts';

/**
 * Los parsers de las guías de Steam, con HTML recortado de páginas reales.
 *
 * Aquí se vigila lo que el usuario notó roto: la lista salía y el texto no.
 * Si Steam cambia su plantilla, estas pruebas caen antes que la aplicación.
 */

const LIST = `
<div class="guides_home_list_ctn">
  <a class="workshopItemCollection ugc" href="https://steamcommunity.com/sharedfiles/filedetails/?id=111" data-appid="588650" data-publishedfileid="111">
    <div class="workshopItemDetails">
      <img class="fileRating" src="https://community.fastly.steamstatic.com/public/images/sharedfiles/5-star.png?v=2" />
      <div class="workshopItemTitle">Gu&#237;a de Logros en espa&#241;ol</div>
      <div class="workshopItemAuthorLine">by&nbsp;<span class="workshopItemAuthorName">unjugador</span></div>
      <div class="workshopItemShortDesc">Todos los logros del juego explicados paso a paso.</div>
    </div>
  </a>
  <a class="workshopItemCollection ugc" href="https://steamcommunity.com/sharedfiles/filedetails/?id=222" data-appid="588650" data-publishedfileid="222">
    <div class="workshopItemDetails">
      <img class="fileRating" src="https://community.fastly.steamstatic.com/public/images/sharedfiles/not-yet.png?v=2" />
      <div class="workshopItemTitle">Complete Achievements Guide</div>
      <div class="workshopItemAuthorLine">by&nbsp;<span class="workshopItemAuthorName">someone</span></div>
      <div class="workshopItemShortDesc">Every achievement in the game, from easiest to hardest.</div>
    </div>
  </a>
</div>`;

describe('parseGuideList', () => {
  const entries = parseGuideList(LIST);

  test('saca una entrada por tarjeta, sin duplicados', () => {
    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map((e) => e.id), ['steam:111', 'steam:222']);
  });

  test('resuelve entidades del título y encuentra al autor', () => {
    assert.equal(entries[0]!.title, 'Guía de Logros en español');
    assert.equal(entries[0]!.author, 'unjugador');
    assert.equal(entries[0]!.snippet, 'Todos los logros del juego explicados paso a paso.');
  });

  test('la URL apunta a la ficha de la guía', () => {
    assert.equal(entries[0]!.url, 'https://steamcommunity.com/sharedfiles/filedetails/?id=111');
  });

  test('todas las guías de Steam se marcan legibles', () => {
    assert.ok(entries.every((entry) => entry.readable));
  });

  test('una lista vacía no revienta', () => {
    assert.deepEqual(parseGuideList('<html><body>nada</body></html>'), []);
  });
});

describe('parseRating', () => {
  test('lee las estrellas cuando las hay', () => {
    assert.equal(parseRating('<img class="fileRating" src="https://x/4-star.png?v=2" />'), 4);
  });

  test('una guía sin votos no tiene puntuación', () => {
    assert.equal(parseRating('<img class="fileRating" src="https://x/not-yet.png" />'), null);
  });
});

describe('detectLanguage', () => {
  test('reconoce el castellano', () => {
    assert.equal(detectLanguage('Guía de todos los logros del juego, con la ruta para conseguirlos'), 'es');
  });

  test('reconoce el inglés', () => {
    assert.equal(detectLanguage('The complete guide for all the achievements in this game'), 'en');
  });

  test('descarta los alfabetos que no se leen aquí', () => {
    assert.equal(detectLanguage('Билд "Ледяная кобра" для всех боссов'), 'otro');
    assert.equal(detectLanguage('全ての実績の攻略ガイド'), 'otro');
  });

  test('no confunde otras lenguas latinas con castellano', () => {
    assert.equal(detectLanguage('Jak przejść oraz jak radzić sobie z przegraną'), 'otro');
  });
});

describe('richText', () => {
  test('los saltos de línea de la guía se conservan', () => {
    const out = richText('Paso uno<br>Paso dos<br/>Paso tres');
    assert.equal(out, 'Paso uno\nPaso dos\nPaso tres');
  });

  test('las listas salen con viñeta', () => {
    assert.equal(richText('<ul><li>uno</li><li>dos</li></ul>'), '· uno\n· dos');
  });

  test('no deja tres saltos seguidos', () => {
    assert.ok(!richText('<p>a</p><p></p><p></p><p>b</p>').includes('\n\n\n'));
  });
});

const DOCUMENT = `
<html><head><title>Steam Community :: Guide :: Logros</title>
<meta property="og:description" content="Resumen de la gu&#237;a" /></head><body>
<div class="workshopItemTitle">Gu&#237;a de Logros</div>
<div class="friendBlockContent">unjugador<br><span>En línea</span></div>
<div class="subSection">
  <div class="subSectionTitle">Introducci&#243;n</div>
  <div class="subSectionDesc">Esta gu&#237;a recoge todos los logros del juego y c&#243;mo sacarlos.<br>Se ordenan de m&#225;s f&#225;cil a m&#225;s dif&#237;cil.</div>
</div>
<div class="subSection">
  <div class="subSectionTitle">Logros de historia</div>
  <div class="subSectionDesc">Salen solos al terminar cada cap&#237;tulo, no hace falta hacer nada especial.
    <img src="https://images.steamusercontent.com/ugc/abc/PIC.png" />
    <img src="https://community.fastly.steamstatic.com/economy/emoticon/smile" />
  </div>
</div>
<div class="subSection">
  <div class="subSectionTitle">Vac&#237;a</div>
  <div class="subSectionDesc">corto</div>
</div>
</body></html>`;

describe('parseGuideDocument', () => {
  const document = parseGuideDocument(DOCUMENT, 'https://steamcommunity.com/sharedfiles/filedetails/?id=111');

  test('devuelve el texto completo, no un extracto', () => {
    assert.ok(document);
    assert.equal(document.partial, false);
    assert.equal(document.title, 'Guía de Logros');
    assert.equal(document.author, 'unjugador');
    assert.equal(document.summary, 'Resumen de la guía');
  });

  test('cada sección lleva su encabezado y su cuerpo', () => {
    assert.ok(document);
    assert.equal(document.sections.length, 2);
    assert.equal(document.sections[0]!.heading, 'Introducción');
    assert.ok(document.sections[0]!.body.includes('todos los logros'));
    assert.ok(document.sections[0]!.body.includes('\n'), 'el salto de línea debería conservarse');
  });

  test('se descartan las secciones sin contenido', () => {
    assert.ok(document);
    assert.ok(!document.sections.some((section) => section.heading === 'Vacía'));
  });

  test('las imágenes de la guía se conservan y los emoticonos no', () => {
    assert.ok(document);
    assert.deepEqual(document.sections[1]!.images, ['https://images.steamusercontent.com/ugc/abc/PIC.png']);
  });

  test('una página sin secciones se rechaza en vez de salir vacía', () => {
    assert.equal(parseGuideDocument('<html><body>sin nada</body></html>', 'https://x/'), null);
  });
});
