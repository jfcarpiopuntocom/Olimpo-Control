// auth-ui.js — Control de acceso de Olimpo Control (100% en el navegador,
// sin servidor: las claves viven en localStorage). Dos capas claramente
// separadas: DUEÑO y EMPLEADO. Dentro de la del dueño, la info contable
// (cuentas T, P&L, balance) queda detrás de una SUBCLAVE aparte.
//
// La clave es un PIN de 3 dígitos. Cada dígito 0-9 se muestra como un trío
// de emojis (3 emojis por dígito). El usuario toca 3 teclas = 3 dígitos.
(function () {
  // --- Mapa dígito -> trío de emojis (lo visible). El backbone es numérico. ---
  const TRIOS = {
    0: "🔑🗝️🔒", 1: "🍊🔥🌵", 2: "🐉🌊🍀", 3: "⭐🌙☀️", 4: "🦜🐢🦋",
    5: "🌶️🍋🫐", 6: "🎸🥁🎺", 7: "🏔️⛰️🗻", 8: "🦕🐢🐌", 9: "🛶🚲🏍️",
  };

  // --- Claves por defecto (el dueño puede cambiarlas en Avanzado) ---
  const DEF = { owner: "159", empleados: ["260"], acct: "357", email: "" };
  function cfg() {
    try { return JSON.parse(localStorage.getItem("oc_auth") || "null") || { ...DEF }; }
    catch { return { ...DEF }; }
  }
  function guardar(c) { localStorage.setItem("oc_auth", JSON.stringify(c)); }
  if (!localStorage.getItem("oc_auth")) guardar({ ...DEF });

  let rol = null; // "dueno" | "empleado"

  // ---------- CSS ----------
  const css = document.createElement("style");
  css.textContent = `
  #oc-gate{position:fixed;inset:0;z-index:9999;background:var(--azul-oscuro,#1c3049);
    display:flex;align-items:center;justify-content:center;padding:20px;}
  #oc-gate .caja{background:var(--blanco-calido,#fbf5e8);border:2px solid var(--brass,#9c7a35);
    border-radius:8px;padding:26px 22px;max-width:420px;width:100%;text-align:center;}
  #oc-gate h2{font-family:var(--font-display,sans-serif);color:var(--ink,#211c14);font-size:22px;margin:0 0 4px;}
  #oc-gate .sub{font-size:14px;color:var(--ink-soft,#5d5340);margin-bottom:18px;}
  #oc-slots{display:flex;gap:10px;justify-content:center;margin-bottom:16px;}
  #oc-slots .slot{width:64px;height:54px;border:2px solid var(--azul-medio,#2c4a68);border-radius:6px;
    display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--crema,#f3e8cd);}
  #oc-slots .slot.lleno{border-color:var(--rust,#b2461f);}
  #oc-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
  #oc-pad button{font-size:19px;padding:12px 4px;line-height:1.1;border:2px solid var(--ink,#211c14);
    border-radius:6px;background:var(--crema,#f3e8cd);cursor:pointer;min-height:48px;}
  #oc-pad button:active{transform:translateY(1px);}
  #oc-acciones{display:flex;gap:8px;margin-top:14px;}
  #oc-acciones button{flex:1;font-family:var(--font-display,sans-serif);font-size:14px;padding:12px;
    border-radius:6px;border:2px solid var(--azul-medio,#2c4a68);background:var(--blanco-calido,#fbf5e8);
    color:var(--azul-medio,#2c4a68);cursor:pointer;min-height:44px;text-transform:uppercase;}
  #oc-msg{min-height:20px;font-size:14px;font-weight:700;color:var(--rojo,#a3392a);margin-top:12px;}
  #oc-gate.err .caja{animation:ocshake .35s;}
  @keyframes ocshake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
  #oc-logout{font-family:var(--font-display,sans-serif);font-size:13px;padding:8px 12px;border-radius:5px;
    border:2px solid var(--brass,#9c7a35);background:transparent;color:var(--blanco-calido,#fbf5e8);
    cursor:pointer;text-transform:uppercase;}
  body.rol-empleado nav button[data-vista="avanzado"],
  body.rol-empleado nav button[data-vista="actividad"]{display:none!important;}
  #oc-acct-lock{text-align:center;padding:22px;}
  #oc-acct-lock button{font-family:var(--font-display,sans-serif);font-size:14px;padding:12px 20px;
    border-radius:6px;border:2px solid var(--rust,#b2461f);background:var(--rust,#b2461f);
    color:var(--blanco-calido,#fbf5e8);cursor:pointer;min-height:44px;}
  `;
  document.head.appendChild(css);

  // ---------- Gate DOM ----------
  const gate = document.createElement("div");
  gate.id = "oc-gate";
  const padKeys = Object.keys(TRIOS).map((d) => `<button data-d="${d}">${TRIOS[d]}</button>`).join("");
  gate.innerHTML = `
    <div class="caja">
      <h2>Olimpo Control</h2>
      <div class="sub">Toca tu clave de 3 emojis para entrar</div>
      <div id="oc-slots"><div class="slot"></div><div class="slot"></div><div class="slot"></div></div>
      <div id="oc-pad">${padKeys}</div>
      <div id="oc-acciones">
        <button id="oc-borrar">Borrar</button>
        <button id="oc-recuperar">¿Olvidaste?</button>
      </div>
      <div id="oc-msg"></div>
    </div>`;
  document.body.appendChild(gate);

  let entrada = []; // dígitos ingresados
  const slots = () => gate.querySelectorAll("#oc-slots .slot");
  function pintar() {
    slots().forEach((s, i) => {
      if (entrada[i] != null) { s.textContent = TRIOS[entrada[i]]; s.classList.add("lleno"); s.style.fontSize = "13px"; }
      else { s.textContent = ""; s.classList.remove("lleno"); }
    });
  }
  function error(txt) {
    gate.querySelector("#oc-msg").textContent = txt;
    gate.classList.add("err");
    setTimeout(() => gate.classList.remove("err"), 400);
    entrada = []; pintar();
  }
  function entrar(nuevoRol) {
    rol = nuevoRol;
    document.body.classList.toggle("rol-empleado", rol === "empleado");
    document.body.classList.toggle("rol-dueno", rol === "dueno");
    gate.style.display = "none";
    montarLogout();
    // Si estaba en una vista oculta para empleado, vuelve a Hoy
    if (rol === "empleado") {
      const nav = document.querySelector('nav button[data-vista="hoy"]');
      if (nav) nav.click();
    }
    window.dispatchEvent(new CustomEvent("oc-login", { detail: { rol } }));
  }
  function validar() {
    const code = entrada.join("");
    const c = cfg();
    if (code === c.owner) return entrar("dueno");
    if ((c.empleados || []).includes(code)) return entrar("empleado");
    error("Clave incorrecta. Intenta de nuevo.");
  }

  gate.querySelector("#oc-pad").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]"); if (!b) return;
    if (entrada.length >= 3) return;
    entrada.push(Number(b.dataset.d));
    pintar();
    gate.querySelector("#oc-msg").textContent = "";
    if (entrada.length === 3) setTimeout(validar, 150);
  });
  gate.querySelector("#oc-borrar").addEventListener("click", () => { entrada = []; pintar(); gate.querySelector("#oc-msg").textContent = ""; });
  gate.querySelector("#oc-recuperar").addEventListener("click", () => {
    const c = cfg();
    if (!c.email) { gate.querySelector("#oc-msg").style.color = "var(--ink-soft,#5d5340)"; gate.querySelector("#oc-msg").textContent = "No hay correo de recuperación configurado. Pídele al dueño que lo registre en Avanzado."; return; }
    gate.querySelector("#oc-msg").style.color = "var(--verde,#2f7a4f)";
    gate.querySelector("#oc-msg").textContent = `Se enviaría un enlace de recuperación a ${enmascarar(c.email)} (demo: no se envía correo real).`;
  });

  // ---------- Logout en el header ----------
  function montarLogout() {
    if (document.getElementById("oc-logout")) return;
    const header = document.querySelector("header");
    if (!header) return;
    const b = document.createElement("button");
    b.id = "oc-logout"; b.textContent = "Salir";
    b.addEventListener("click", () => {
      rol = null; document.body.classList.remove("rol-empleado", "rol-dueno");
      entrada = []; pintar(); gate.querySelector("#oc-msg").textContent = "";
      gate.style.display = "flex"; b.remove();
    });
    header.appendChild(b);
  }

  // ---------- Utilidades expuestas para la vista Avanzado ----------
  function enmascarar(email) {
    const [u, dom] = String(email).split("@");
    if (!dom) return "•••";
    const visible = u.slice(0, 1);
    return `${visible}${"•".repeat(Math.max(2, u.length - 1))}@${dom}`;
  }

  window.OCAuth = {
    rolActual: () => rol,
    cfg, guardar, enmascarar, TRIOS,
    // Pide la subclave contable; resuelve true/false
    pedirSubclaveContable() {
      return new Promise((resolve) => {
        const c = cfg();
        // Reusar el mismo gate visual sería complejo; pedimos por un mini-prompt de emojis.
        const cont = document.createElement("div");
        cont.id = "oc-gate"; cont.style.background = "rgba(28,48,73,0.92)";
        const keys = Object.keys(TRIOS).map((d) => `<button data-d="${d}">${TRIOS[d]}</button>`).join("");
        cont.innerHTML = `<div class="caja"><h2>Capa contable</h2>
          <div class="sub">Subclave de 3 emojis para ver cuentas T, P&amp;G y balance</div>
          <div id="oc-slots2" style="display:flex;gap:10px;justify-content:center;margin-bottom:16px;">
            <div class="slot"></div><div class="slot"></div><div class="slot"></div></div>
          <div id="oc-pad">${keys}</div>
          <div id="oc-acciones"><button id="sc-cancelar">Cancelar</button><button id="sc-borrar">Borrar</button></div>
          <div id="oc-msg"></div></div>`;
        document.body.appendChild(cont);
        let ent = [];
        const sl = () => cont.querySelectorAll("#oc-slots2 .slot");
        const px = () => sl().forEach((s, i) => { if (ent[i] != null) { s.textContent = TRIOS[ent[i]]; s.classList.add("lleno"); s.style.fontSize = "13px"; } else { s.textContent = ""; s.classList.remove("lleno"); } });
        cont.querySelector("#oc-pad").addEventListener("click", (e) => {
          const b = e.target.closest("button[data-d]"); if (!b || ent.length >= 3) return;
          ent.push(Number(b.dataset.d)); px();
          if (ent.length === 3) setTimeout(() => {
            if (ent.join("") === c.acct) { cont.remove(); resolve(true); }
            else { cont.querySelector("#oc-msg").textContent = "Subclave incorrecta."; cont.classList.add("err"); setTimeout(() => cont.classList.remove("err"), 400); ent = []; px(); }
          }, 150);
        });
        cont.querySelector("#sc-borrar").addEventListener("click", () => { ent = []; px(); });
        cont.querySelector("#sc-cancelar").addEventListener("click", () => { cont.remove(); resolve(false); });
      });
    },
  };
})();
