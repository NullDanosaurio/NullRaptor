// Pantalla de inicio de la app: guarda la dirección del panel (solo https en *.ts.net, la red de Tailscale) y entra.
// Con ?cambiar se vuelve a pedir (la app la abre así si el panel no responde).
(() => {
  const CLAVE = 'nullraptor.panel';
  const valida = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /\.ts\.net$/i.test(x.hostname) ? x.origin : null; } catch { return null; } };
  const guardada = valida(localStorage.getItem(CLAVE) || '');
  const cambiar = new URLSearchParams(location.search).has('cambiar');
  if (guardada && !cambiar) { location.replace(guardada); return; }
  const campo = document.getElementById('direccion');
  const aviso = document.getElementById('aviso');
  if (guardada) campo.value = guardada;
  document.getElementById('formulario').addEventListener('submit', (e) => {
    e.preventDefault();
    const origen = valida(campo.value.trim());
    if (!origen) { aviso.textContent = 'Tiene que ser la dirección https de tu panel en Tailscale (termina en .ts.net).'; aviso.hidden = false; return; }
    localStorage.setItem(CLAVE, origen);
    location.replace(origen);
  });
})();
