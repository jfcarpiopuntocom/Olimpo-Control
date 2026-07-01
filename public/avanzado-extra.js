// avanzado-extra.js — Reestructura la vista "Avanzado" del dueño en dos capas:
//   1) Gestión (gastos, correo de recuperación, claves) — visible al dueño.
//   2) Contable (cuentas T, P&G, balance, valorizado) — detrás de la SUBCLAVE.
// Depende de window.OCAuth (auth-ui.js).
(function () {
  function $(id) { return document.getElementById(id); }
  const API = "/api";
  let desbloqueadaSesion = false;

  function ubic() { const s = $("selectUbicacion"); return s ? s.value : "todas"; }
  const money = (n) => "$" + Number(n || 0).toFixed(2);
  // Distingue "primer registro libre de correo" (no dispara nada más) de
  // "re-registro tras código maestro" (SÍ debe encadenar directo a poner un
  // PIN nuevo — JFC, 2026-07-01: "hagamos que puedan cambiar la clave,
  // falta ese detallito"). Sin esta bandera, pintarEmail() no puede saber
  // por qué camino llegó a mostrar el formulario de correo vacío.
  let reasignacionViaMaestro = false;

  function init() {
    const vista = $("vista-avanzado");
    if (!vista || vista.dataset.ocReady) return;
    vista.dataset.ocReady = "1";

    // --- Mover los bloques contables a un contenedor cerrable ---
    const cont = document.createElement("div");
    cont.id = "oc-contable";
    cont.style.display = "none";
    // T-accounts arriba
    const tboxes = document.createElement("div");
    tboxes.id = "oc-taccounts";
    tboxes.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;margin:6px 0 22px;";
    cont.appendChild(tboxes);

    // Mover PL / balance / valorizado (h3 + tabla-wrap) al contenedor
    const marcadores = ["tablaPL", "tablaBalance", "tablaValorizado"];
    marcadores.forEach((idTabla) => {
      const tabla = $(idTabla);
      if (!tabla) return;
      const wrap = tabla.closest(".tabla-wrap");
      const h3 = wrap && wrap.previousElementSibling;
      if (h3 && h3.tagName === "H3") cont.appendChild(h3);
      if (wrap) cont.appendChild(wrap);
    });

    // --- Respaldo exportable/importable (tronco 3, JFC 2026-07-01) ---
    // Vive DENTRO de "cont" (detrás de la subclave contable): exportar/
    // importar el negocio completo es una acción sensible, no debe estar al
    // alcance de un empleado ni de cualquiera que abra Avanzado.
    const respaldo = document.createElement("div");
    respaldo.className = "tag-card";
    respaldo.style.cssText = "text-align:left;margin-top:22px;";
    respaldo.innerHTML = `
      <h3 class="seccion" style="margin-top:0;">Respaldo</h3>
      <p style="font-size:14px;color:var(--ink-soft);margin-top:0;">
        Descarga TODO tu negocio (productos, ventas, movimientos, gastos, claves) en un archivo. Guárdalo en tu correo, tu Drive, donde sea — es tu copia de seguridad si se borra el caché o se daña el dispositivo.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="oc-exportar" class="ir" style="background:var(--azul-medio);color:var(--blanco-calido);border-color:var(--azul-oscuro);">⬇️ Exportar respaldo</button>
        <label class="ir" style="background:var(--rust);color:var(--blanco-calido);border-color:var(--rust-deep);display:inline-flex;align-items:center;cursor:pointer;">⬆️ Importar respaldo
          <input id="oc-importar-file" type="file" accept=".json" style="display:none;">
        </label>
      </div>
      <p id="oc-respaldo-msg" style="font-size:14px;margin-top:10px;font-weight:700;"></p>
    `;
    cont.appendChild(respaldo);

    // --- Candado ---
    const lock = document.createElement("div");
    lock.id = "oc-acct-lock";
    lock.className = "tag-card";
    lock.innerHTML = `<p style="font-size:15px;color:var(--ink-soft);margin:0 0 14px;">
      La capa contable (cuentas T, P&amp;G, balance e inventario valorizado) está protegida con una subclave aparte.</p>
      <button id="oc-acct-open">🔒 Ver capa contable</button>`;
    vista.appendChild(lock);
    vista.appendChild(cont);

    $("oc-acct-open").addEventListener("click", async () => {
      if (!desbloqueadaSesion) {
        const ok = await window.OCAuth.pedirSubclaveContable();
        if (!ok) return;
        desbloqueadaSesion = true;
      }
      lock.style.display = "none";
      cont.style.display = "block";
      await render();
    });

    // --- Panel de gestión (correo recuperación + claves) ---
    const gestion = document.createElement("div");
    gestion.className = "panel-escaner tag-card";
    gestion.style.cssText = "text-align:left;margin-top:22px;";
    gestion.innerHTML = `
      <h3 class="seccion" style="margin-top:0;">Acceso y recuperación</h3>
      <p style="font-size:14px;color:var(--ink-soft);margin-top:0;">Correo del dueño para recuperar las claves. Una vez guardado se oculta y queda ofuscado.</p>
      <div id="oc-email-row"></div>
      <div style="margin-top:18px;">
        <p style="font-size:14px;color:var(--ink-soft);">Claves (PIN de 3 dígitos). Por seguridad, los códigos actuales NO se muestran aquí (se guardan cifrados) — escribe los NUEVOS solo si quieres cambiarlos.</p>
        <div style="display:flex;flex-direction:column;gap:8px;max-width:340px;">
          <label style="font-size:13px;">Dueño <input id="oc-c-owner" maxlength="3" inputmode="numeric" placeholder="•••" style="margin-left:8px;width:90px;text-align:center;font-family:var(--font-mono);padding:8px;border:2px solid var(--azul-medio);border-radius:5px;"></label>
          <label style="font-size:13px;">Empleado <input id="oc-c-emp" maxlength="3" inputmode="numeric" placeholder="•••" style="margin-left:8px;width:90px;text-align:center;font-family:var(--font-mono);padding:8px;border:2px solid var(--azul-medio);border-radius:5px;"></label>
          <label style="font-size:13px;">Contable <input id="oc-c-acct" maxlength="3" inputmode="numeric" placeholder="•••" style="margin-left:8px;width:90px;text-align:center;font-family:var(--font-mono);padding:8px;border:2px solid var(--azul-medio);border-radius:5px;"></label>
        </div>
        <button id="oc-save-codes" class="ir" style="margin-top:12px;background:var(--azul-medio);color:var(--blanco-calido);border-color:var(--azul-oscuro);">Guardar nuevas claves</button>
        <p id="oc-codes-msg" style="font-size:14px;margin-top:8px;"></p>
      </div>`;
    vista.appendChild(gestion);

    // --- Conectar Loyverse + reseteo maestro (solo con backend real, no en
    // la demo estática — ver window.OC_DEMO en mock-backend.js) ---
    if (!window.OC_DEMO) {
      const loy = document.createElement("div");
      loy.className = "panel-escaner tag-card";
      loy.style.cssText = "text-align:left;margin-top:22px;";
      loy.innerHTML = `
        <h3 class="seccion" style="margin-top:0;">Conectar Loyverse</h3>
        <p style="font-size:14px;color:var(--ink-soft);margin-top:0;" id="oc-loy-estado">Cargando estado…</p>
        <input id="oc-loy-token" type="password" placeholder="Access Token de Loyverse" style="width:100%;padding:10px;border:2px solid var(--azul-medio);border-radius:5px;font-family:var(--font-mono);margin-top:6px;">
        <button id="oc-loy-guardar" class="ir" style="margin-top:10px;background:var(--azul-medio);color:var(--blanco-calido);border-color:var(--azul-oscuro);">Guardar y conectar</button>
        <p id="oc-loy-msg" style="font-size:14px;margin-top:8px;font-weight:700;"></p>
      `;
      vista.appendChild(loy);

      fetch(`${API}/config/loyverse`).then((r) => r.json()).then((s) => {
        $("oc-loy-estado").textContent = s.modoActual === "loyverse"
          ? "✅ Conectado a Loyverse. Los datos que ves vienen de tu cuenta real."
          : s.tokenGuardado
            ? "Token guardado pero el servidor no se ha reiniciado todavía — reinícialo para activar Loyverse."
            : "Sin conectar. Estás viendo datos de ejemplo. Pega tu Access Token de Loyverse (Back Office → Settings → Access Tokens) para conectar tu cuenta real.";
      }).catch(() => { $("oc-loy-estado").textContent = "No se pudo consultar el estado."; });

      $("oc-loy-guardar").addEventListener("click", async () => {
        const token = $("oc-loy-token").value.trim();
        if (!token) { msg("oc-loy-msg", "Pega tu Access Token primero.", "var(--rojo)"); return; }
        const res = await fetch(`${API}/config/loyverse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
        const r = await res.json();
        if (!res.ok) { msg("oc-loy-msg", r.error, "var(--rojo)"); return; }
        $("oc-loy-token").value = "";
        msg("oc-loy-msg", r.mensaje, "var(--verde)");
      });

      // NOTA (JFC, 2026-07-01): el reseteo maestro de 777 NO tiene interfaz
      // aquí a propósito — "no le aparece a Jose ni a los clientes". Vive
      // SOLO en el servidor (POST /api/config/reset-maestro en server.js),
      // JFC lo dispara él mismo directo a la API cuando de verdad hace
      // falta (dueño totalmente bloqueado). No poner un botón acá, NUNCA,
      // aunque parezca conveniente para "probarlo rápido" — ese es
      // exactamente el tipo de exposición que este diseño evita.
    }

    window.OCAuth.listo().then(() => { pintarEmail(); });

    // Cambiar los 3 PINs rota TODO (nuevo salt + nuevos hashes). Por eso se
    // piden los tres juntos: no se puede "mantener" un hash viejo bajo un
    // salt nuevo. JFC pidió explícitamente: si el dueño cambia su código,
    // EXIGIR que ya tenga un correo de recuperación guardado (si no, no se
    // puede recuperar el código nuevo si se le olvida). El correo en sí no
    // se toca aquí — se preserva tal cual esté guardado.
    $("oc-save-codes").addEventListener("click", async () => {
      const o = $("oc-c-owner").value.trim(), e = $("oc-c-emp").value.trim(), a = $("oc-c-acct").value.trim();
      const valido = (s) => /^[0-9]{3}$/.test(s);
      if (![o, e, a].every(valido)) { msg("oc-codes-msg", "Cada clave debe ser 3 dígitos (0-9).", "var(--rojo)"); return; }
      const correoActual = window.OCSecure.leerCorreo();
      if (!correoActual) { msg("oc-codes-msg", "Antes de cambiar las claves, registra tu correo de recuperación arriba (si olvidas el código nuevo, sin correo no hay forma de recuperarlo).", "var(--rojo)"); return; }
      await window.OCSecure.guardarSecreto(o, [e], a, correoActual);
      $("oc-c-owner").value = ""; $("oc-c-emp").value = ""; $("oc-c-acct").value = "";
      msg("oc-codes-msg", "Claves guardadas y cifradas.", "var(--verde)");
    });

    // El respaldo incluye TANTO los datos del negocio (server/mock, vía
    // /api/respaldo/exportar) COMO el estado de acceso cifrado
    // (localStorage["oc_secure"]: hashes de PIN + correo) — sin esto último,
    // restaurar en otra tablet dejaría al dueño sin sus propias claves.
    $("oc-exportar").addEventListener("click", async () => {
      try {
        const datos = await (await fetch(`${API}/respaldo/exportar`)).json();
        const paquete = { fecha: new Date().toISOString(), datos, oc_secure: localStorage.getItem("oc_secure") };
        const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `respaldo-olimpo-control-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        msg("oc-respaldo-msg", "Respaldo descargado. Guárdalo en un lugar seguro.", "var(--verde)");
      } catch (e) { msg("oc-respaldo-msg", "No se pudo exportar: " + e.message, "var(--rojo)"); }
    });

    $("oc-importar-file").addEventListener("change", async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const paquete = JSON.parse(await file.text());
        if (!paquete.datos) { msg("oc-respaldo-msg", "Ese archivo no parece un respaldo de Olimpo Control.", "var(--rojo)"); return; }
        if (!confirm("Esto REEMPLAZA todos los datos actuales (productos, ventas, claves) con los del respaldo. ¿Continuar?")) return;
        const res = await fetch(`${API}/respaldo/importar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(paquete.datos) });
        const r = await res.json();
        if (!res.ok) { msg("oc-respaldo-msg", r.error, "var(--rojo)"); return; }
        if (paquete.oc_secure) localStorage.setItem("oc_secure", paquete.oc_secure);
        msg("oc-respaldo-msg", "Respaldo importado. Recarga la página para ver los datos restaurados.", "var(--verde)");
      } catch (err) { msg("oc-respaldo-msg", "No se pudo importar: " + err.message, "var(--rojo)"); }
      e.target.value = "";
    });

    // Versión + stack, al fondo de todo Avanzado (JFC, 2026-07-01: "la
    // versión va al fondo junto al stack de tech... al fondo de avanzados
    // mejor aún"). Se agrega último a propósito para que quede debajo de
    // gestión y Loyverse, no arriba.
    const version = document.createElement("p");
    version.style.cssText = "font-size:13px;color:var(--ink-soft,#5d5340);text-align:center;margin-top:30px;line-height:1.6;";
    version.innerHTML = "Olimpo Control 1.0 — Node.js · Express · WebCrypto AES-256-GCM · PBKDF2 (150k it.) · Code128 · QR · arquitectura de cifrado end-to-end inspirada en nostr, sin servidor central de identidad<br><em>desarrollado por The Real Urban Shaman para Olimpo Club - 2026</em>";
    vista.appendChild(version);
  }

  // Cambiar un correo YA registrado exige el código maestro (solo JFC lo
  // conoce) — pedido explícito de JFC como "master admin": evita que
  // cualquiera con el dispositivo del dueño secuestre la cuenta apuntando la
  // recuperación a un correo propio. Si NO hay correo (primera vez), el
  // dueño lo registra libre, sin master. Ver nota larga en crypto-store.js.
  function pintarEmail() {
    const email = window.OCSecure.leerCorreo();
    const row = $("oc-email-row");
    if (email) {
      row.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-family:var(--font-mono);font-size:15px;color:var(--ink);">${window.OCAuth.enmascarar(email)}</span>
        <button id="oc-email-edit" style="font-size:13px;padding:8px 12px;border:2px solid var(--azul-medio);border-radius:5px;background:transparent;color:var(--azul-medio);cursor:pointer;">Cambiar (requiere código maestro)</button></div>`;
      $("oc-email-edit").addEventListener("click", pedirMaestroYCambiarCorreo);
    } else {
      row.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;">
        <input id="oc-email-in" type="email" placeholder="correo@dominio.com" style="flex:1;min-width:200px;padding:10px;border:2px solid var(--azul-medio);border-radius:5px;font-family:var(--font-mono);">
        <button id="oc-email-save" class="ir" style="background:var(--rust);color:var(--blanco-calido);border-color:var(--rust-deep);">Guardar</button></div>
        <p id="oc-email-msg" style="font-size:14px;margin-top:8px;"></p>`;
      $("oc-email-save").addEventListener("click", () => {
        const v = $("oc-email-in").value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { msg("oc-email-msg", "Correo no válido.", "var(--rojo)"); return; }
        window.OCSecure.actualizarCorreo(v);
        pintarEmail();
        // El detalle que faltaba: si este correo se registró DESPUÉS de
        // verificar el código maestro (dueño bloqueado, JFC ayudándolo),
        // seguimos de una vez al flujo de "pon tu PIN nuevo" — no lo dejamos
        // con el correo cambiado pero sin forma de entrar todavía.
        if (reasignacionViaMaestro) {
          reasignacionViaMaestro = false;
          window.OCAuth.abrirFlujoReset(v);
        }
      });
    }
  }

  // Pide el código maestro (candado de JFC) antes de dejar editar un correo
  // ya registrado. Reutiliza el mismo patrón visual del candado contable.
  function pedirMaestroYCambiarCorreo() {
    const cont = document.createElement("div");
    cont.className = "oc-subgate";
    cont.innerHTML = `<div class="caja" style="background:var(--blanco-calido);border:2px solid var(--brass);border-radius:8px;padding:26px 22px;max-width:420px;width:100%;text-align:center;">
      <h2 style="font-family:var(--font-display);color:var(--ink);font-size:20px;margin:0 0 4px;">Código maestro</h2>
      <p style="font-size:14px;color:var(--ink-soft);margin-bottom:14px;">Solo JFC lo tiene. Identifica al dueño en persona o videollamada antes de dárselo.</p>
      <input id="mst-codigo" type="text" style="width:100%;padding:10px;border:2px solid var(--azul-medio);border-radius:5px;font-family:var(--font-mono);text-align:center;">
      <div style="display:flex;gap:8px;margin-top:12px;">
        <button id="mst-cancelar" style="flex:1;padding:10px;border-radius:6px;border:2px solid var(--azul-medio);background:transparent;color:var(--azul-medio);cursor:pointer;">Cancelar</button>
        <button id="mst-ok" class="ir" style="flex:1;">Verificar</button>
      </div>
      <p id="mst-msg" style="font-size:14px;margin-top:10px;font-weight:700;color:var(--rojo);"></p>
    </div>`;
    document.body.appendChild(cont);
    cont.querySelector("#mst-cancelar").addEventListener("click", () => cont.remove());
    cont.querySelector("#mst-ok").addEventListener("click", async () => {
      const codigo = cont.querySelector("#mst-codigo").value.trim();
      const ok = await window.OCSecure.verificarMaestro(codigo);
      if (!ok) { cont.querySelector("#mst-msg").textContent = "Código maestro incorrecto."; return; }
      window.OCSecure.actualizarCorreo("");
      reasignacionViaMaestro = true;
      cont.remove();
      pintarEmail();
    });
  }

  function msg(id, txt, color) { const el = $(id); if (el) { el.style.color = color; el.textContent = txt; } }

  async function render() {
    const u = ubic();
    const [pl, bal] = await Promise.all([
      fetch(`${API}/reportes/pl?ubicacionId=${u}`).then((r) => r.json()),
      fetch(`${API}/reportes/balance?ubicacionId=${u}`).then((r) => r.json()),
    ]);
    // Cuentas T derivadas del día (partida doble simplificada)
    const cuentas = [
      { nombre: "Caja (Activo)", debe: [["Ventas del día", pl.ingresos]], haber: [["Gastos operativos", pl.gastosOperativos]] },
      { nombre: "Ventas (Ingreso)", debe: [], haber: [["Ingresos del día", pl.ingresos]] },
      { nombre: "Costo de Ventas (Gasto)", debe: [["Costo de lo vendido", pl.costoVentas]], haber: [] },
      { nombre: "Inventario (Activo)", debe: [["Saldo valorizado", bal.activos.inventarioValorizado]], haber: [["Salida por ventas", pl.costoVentas]] },
      { nombre: "Gastos Operativos (Gasto)", debe: [["Prorrateo del día", pl.gastosOperativos]], haber: [] },
    ];
    $("oc-taccounts").innerHTML = cuentas.map(tAccount).join("");
  }

  function tAccount(c) {
    const filas = Math.max(c.debe.length, c.haber.length, 1);
    let rows = "";
    for (let i = 0; i < filas; i++) {
      const d = c.debe[i], h = c.haber[i];
      rows += `<tr>
        <td style="width:50%;padding:4px 6px;font-size:13px;border-right:1.5px solid var(--ink);">${d ? d[0] + " " + money(d[1]) : ""}</td>
        <td style="width:50%;padding:4px 6px;font-size:13px;">${h ? h[0] + " " + money(h[1]) : ""}</td></tr>`;
    }
    return `<div class="tag-card" style="padding:12px;">
      <div style="font-family:var(--font-display);font-weight:700;font-size:14px;text-align:center;color:var(--ink);border-bottom:2px solid var(--ink);padding-bottom:6px;margin-bottom:4px;">${c.nombre}</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><th style="font-size:11px;color:var(--ink-soft);border-right:1.5px solid var(--ink);border-bottom:1px solid var(--ink);">DEBE</th><th style="font-size:11px;color:var(--ink-soft);border-bottom:1px solid var(--ink);">HABER</th></tr>
        ${rows}
      </table></div>`;
  }

  // Si la ubicación cambia mientras está desbloqueada, re-render
  document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "selectUbicacion" && desbloqueadaSesion && $("oc-contable") && $("oc-contable").style.display !== "none") render();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
