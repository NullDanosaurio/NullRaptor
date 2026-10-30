// Página de entrada por Tailscale: passkey (WebAuthn). La sirve el servidor en /entrar.js antes de iniciar sesión.
(() => {
  const $ = (s) => document.querySelector(s);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const aviso = (t, error = true) => { const p = $('#aviso'); p.textContent = t; p.className = error ? 'e' : ''; };

  async function pedir(ruta, cuerpo) {
    const r = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Nullraptor': '1' }, body: JSON.stringify(cuerpo ?? {}) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? `Error ${r.status}`);
    return d;
  }

  async function entrar() {
    aviso('Esperando a tu passkey…', false);
    const o = await pedir('/entrar/opciones');
    const c = await navigator.credentials.get({ publicKey: { ...o, challenge: deB64(o.challenge) } });
    const r = c.response;
    await pedir('/entrar/passkey', { id: c.id, clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature) });
    location.replace('/');
  }

  async function alta() {
    const codigo = $('#codigo').value;
    if (!codigo.trim()) { aviso('Escribe el código.'); return; }
    aviso('Esperando a tu passkey…', false);
    const o = await pedir('/entrar/alta/opciones', { codigo });
    const c = await navigator.credentials.create({ publicKey: {
      ...o, challenge: deB64(o.challenge), user: { ...o.user, id: deB64(o.user.id) },
      excludeCredentials: o.excludeCredentials.map((e) => ({ ...e, id: deB64(e.id) })),
    } });
    const r = c.response;
    if (!r.getPublicKey || !r.getAuthenticatorData) throw new Error('Este navegador es demasiado antiguo para passkeys: actualízalo.');
    await pedir('/entrar/alta', {
      nombre: $('#nombre').value,
      respuesta: { id: c.id, clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.getAuthenticatorData()), publicKey: b64(r.getPublicKey()), alg: r.getPublicKeyAlgorithm() },
    });
    location.replace('/');
  }

  const conAviso = (fn) => (e) => { e.preventDefault(); fn().catch((err) => aviso(err.name === 'NotAllowedError' ? 'Cancelado o sin respuesta de la passkey.' : err.message)); };
  if (!window.PublicKeyCredential) aviso('Este navegador no admite passkeys.');
  $('#entrar')?.addEventListener('click', conAviso(entrar));
  $('#alta')?.addEventListener('submit', conAviso(alta));
  const codigo = new URLSearchParams(location.search).get('alta');
  if (codigo && $('#codigo')) { $('#codigo').value = codigo; $('#nombre').focus(); }
})();
