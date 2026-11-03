// Revisa el panel a tamaño de móvil (y escritorio): capturas de cada vista y lo que se sale de la pantalla.
// Lección de Roleplay: el móvil solo queda bien si se mira, no basta con que «sea responsive».
//   node scripts/revisar-movil.mjs <url del panel> <carpeta de capturas> [anchos, por defecto 360,412,1280]
// El panel tiene que dejar entrar sin código (una copia sin PANEL_RED, p. ej. PANEL_PUERTO=4778 node panel/servidor.mjs).
// Necesita playwright-core y su Chromium (no van en el repositorio): NULLRAPTOR_PLAYWRIGHT=<ruta a playwright-core>.
import fs from 'node:fs';

const { chromium } = await import(process.env.NULLRAPTOR_PLAYWRIGHT ?? 'playwright-core');
const [base, salida, anchosTxt = '360,412,1280'] = process.argv.slice(2);
if (!base || !salida) { console.error('Uso: node scripts/revisar-movil.mjs <url> <carpeta> [anchos]'); process.exit(1); }
const VISTAS = ['resumen', 'proyectos', 'jarvis', 'boveda', 'chat', 'chat/nuevo', 'herramientas', 'ajustes'];
fs.mkdirSync(salida, { recursive: true });
const navegador = await chromium.launch();
let problemas = 0;
for (const ancho of anchosTxt.split(',').map(Number)) {
  const movil = ancho < 768;
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: movil ? 800 : 860 }, deviceScaleFactor: 2, isMobile: movil, hasTouch: movil });
  for (const v of VISTAS) {
    await pagina.goto(`${base}/#/${v}`);
    await pagina.waitForTimeout(1200);
    const d = await pagina.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      // Lo que se sale de su caja por la derecha (aunque el contenedor con scroll lo recorte, se ve cortado).
      const cortados = [...document.querySelectorAll('main *')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > vw + 1 && r.left < vw && !el.closest('svg');
      }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()} «${(el.textContent || '').trim().slice(0, 30)}»`);
      const pequenos = movil => [...document.querySelectorAll('button, a, [role=tab], select, input')].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width && r.height && r.top < innerHeight && r.bottom > 0 && (r.height < 32 || r.width < 32);
      }).length;
      return { vw, sw: document.documentElement.scrollWidth, cortados, pequenos: pequenos() };
    });
    const mal = d.sw > d.vw || d.cortados.length;
    if (mal) problemas += 1;
    console.log(`${ancho}px ${v}: ${mal ? 'SE SALE' : 'bien'}${movil ? ` · ${d.pequenos} controles < 32 px` : ''}`);
    for (const c of d.cortados) console.log(`    ${c}`);
    await pagina.screenshot({ path: `${salida}/${ancho}-${v.replace(/\//g, '_')}.png` });
  }
  await pagina.close();
}
await navegador.close();
console.log(problemas ? `\n${problemas} vistas con algo que se sale.` : '\nNada se sale de la pantalla. Mira las capturas: el resto (comodidad) no se mide solo.');
process.exitCode = problemas ? 1 : 0;
