// Rutas de las sesiones remotas (terminal de Claude Code) y de seguridad (passkeys). Reglas:
//  - Desde este equipo (localhost): como el resto del panel.
//  - Por Tailscale (petición remota con passkey): abrir, ver o escribir en la terminal y gestionar passkeys exige
//    haber confirmado la passkey en la última hora (reautenticar).
//  - Por la red de casa con solo el código (PANEL_RED): la terminal no se puede usar.
const ID = '([0-9a-f-]{36})';

export function crearRutasRemoto({ remoto, passkeys, sesiones, registro, dominio, leerCuerpo, json }) {
  const reautenticar = { error: 'Confirma con tu passkey para seguir.', reautenticar: true };

  /** ctx: { remota, sesion, soloCodigo, quien }. Devuelve true si atendió la petición. */
  return async function manejar(req, res, p, ctx) {
    const { remota, sesion, soloCodigo, quien } = ctx;
    const confirmado = () => !remota || sesiones.reautenticada(sesion);
    const permisoTerminal = () => {
      if (soloCodigo) return [403, { error: 'La terminal solo se usa desde este equipo o por Tailscale con passkey.' }];
      return confirmado() ? null : [403, reautenticar];
    };
    const responder = (r) => { json(res, r[0], r[1]); return true; };
    const metodo = (m) => { if (req.method === m) return true; json(res, 405, { error: 'Método no permitido.' }); return false; };

    // —— Sesiones remotas ——
    if (p === '/api/remoto' && req.method === 'GET') {
      json(res, 200, { sesiones: remoto.lista(), maxTotal: remoto.maxTotal, maxMs: remoto.maxMs, terminal: !soloCodigo });
      return true;
    }
    if (p === '/api/remoto/abrir') {
      if (!metodo('POST')) return true;
      const no = permisoTerminal();
      if (no) return responder(no);
      const { proyecto, cols, filas } = await leerCuerpo(req);
      const s = remoto.abrir(proyecto, { quien, cols, filas });
      registro?.acceso({ evento: 'terminal', proyecto, quien });
      if (remota) registro?.aviso(`Terminal abierta en ${proyecto}: ${quien}`);
      json(res, 201, s);
      return true;
    }
    const m = p.match(new RegExp(`^/api/remoto/${ID}/(cerrar|terminal|entrada|tamano)$`));
    if (m) {
      const [, id, accion] = m;
      if (accion === 'cerrar') {
        if (!metodo('POST')) return true;
        return responder(remoto.cerrar(id) ? [200, { ok: true }] : [404, { error: 'Esa sesión remota ya no está abierta.' }]);
      }
      const no = permisoTerminal();
      if (no) return responder(no);
      if (accion === 'terminal') { if (metodo('GET')) remoto.suscribir(id, res, quien); return true; }
      if (!metodo('POST')) return true;
      const cuerpo = await leerCuerpo(req);
      if (accion === 'entrada') { remoto.escribir(id, cuerpo.datos, quien); json(res, 202, { ok: true }); return true; }
      await remoto.tamano(id, cuerpo.cols, cuerpo.filas);
      json(res, 200, { ok: true });
      return true;
    }

    // —— Seguridad: passkeys (solo con PANEL_DOMINIO) ——
    if (!p.startsWith('/api/seguridad')) return false;
    if (!passkeys) return responder([404, { error: 'Sin Tailscale (PANEL_DOMINIO) no hay passkeys.' }]);
    if (p === '/api/seguridad' && req.method === 'GET') {
      json(res, 200, { dominio, remota, confirmado: confirmado(), passkeys: passkeys.lista(), actual: sesion?.passkey?.id ?? null });
      return true;
    }
    if (!metodo('POST')) return true;
    const cuerpo = await leerCuerpo(req);
    if (p === '/api/seguridad/salir') {
      sesiones.cerrar(req);
      json(res, 200, { ok: true }, { 'Set-Cookie': sesiones.cookieBorrar });
      return true;
    }
    if (p === '/api/seguridad/reautenticar/opciones') return responder([200, passkeys.opcionesEntrada('reautenticar')]);
    if (p === '/api/seguridad/reautenticar') {
      if (!sesion) return responder([409, { error: 'Desde este equipo no hace falta.' }]);
      const pk = passkeys.verificar(cuerpo, 'reautenticar');
      sesion.reautenticada = sesiones.ahora();
      registro?.acceso({ evento: 'reautenticar', quien, passkey: pk.nombre });
      return responder([200, { ok: true }]);
    }
    if (!confirmado()) return responder([403, reautenticar]);
    if (p === '/api/seguridad/alta') {
      const { codigo, expira } = passkeys.codigoAlta();
      registro?.acceso({ evento: 'código de alta', quien });
      return responder([200, { codigo, expira, url: `https://${dominio}/entrar?alta=${codigo}` }]);
    }
    if (p === '/api/seguridad/borrar') {
      const ok = passkeys.borrar(cuerpo.id);
      if (ok) registro?.acceso({ evento: 'passkey borrada', id: cuerpo.id, quien });
      return responder(ok ? [200, { ok: true }] : [404, { error: 'Esa passkey no existe.' }]);
    }
    return responder([404, { error: 'No existe.' }]);
  };
}
