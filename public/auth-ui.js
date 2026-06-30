// auth-ui.js — Control de acceso de Olimpo Control (100% en el navegador,
// sin servidor: las claves viven en localStorage). Dos capas claramente
// separadas: DUEÑO y EMPLEADO. Dentro de la del dueño, la info contable
// (cuentas T, P&L, balance) queda detrás de una SUBCLAVE aparte.
//
// ===========================================================================
// NOTAS DE DISEÑO (no visibles al usuario — comentarios de mantenimiento)
// ---------------------------------------------------------------------------
// La clave es un PIN de 3 DÍGITOS. El backbone real y lo que se compara es el
// número (ej. "159"). Cada tecla del pad MUESTRA su dígito (el usuario ve y
// toca dígitos) y, como adorno, unos emojis.
//
// SEGURIDAD / por qué los emojis se BARAJAN en cada carga:
//   En la versión anterior cada dígito tenía un TRÍO FIJO de emojis. Eso era
//   un fallo: el trío fijo ERA el dígito a la vista de cualquiera (delataba el
//   código). Ahora los emojis se reparten aleatoriamente entre las teclas en
//   cada apertura del candado (son intercambiables, no forman un grupo fijo
//   por dígito) y las casillas de la clave se ENMASCARAN con ● al ingresar.
//   Así ni el adorno ni las casillas revelan el código interno.
//
// Si en el futuro JFC quiere que la clave se ingrese por emojis en vez de por
// dígitos, el cambio es: mapear cada emoji tocado a su dígito subyacente. Hoy
// se ingresa por dígito (lo pidió explícitamente: "agrega dígitos").
//
// SEGURIDAD DE LOS PINS (crypto-store.js, cargar ANTES que este archivo):
//   Los 3 PINs (dueño, empleado(s), subclave contable) ya NO viven en texto
//   plano en localStorage. Se validan contra hashes PBKDF2 vía window.OCSecure
//   — ver crypto-store.js para el detalle. Este archivo solo orquesta la UI y
//   llama a OCSecure para verificar/guardar; nunca compara strings de PIN
//   directamente.
// ===========================================================================
(function () {
  // Pool de emojis de adorno. Se barajan; ninguno está atado a un dígito fijo.
  const EMOJI_POOL = [
    "🍊", "🔥", "🌵", "🐉", "🌊", "🍀", "⭐", "🌙", "☀️", "🦜",
    "🐢", "🦋", "🌶️", "🍋", "🫐", "🎸", "🥁", "🎺", "🏔️", "🛶",
    "🚲", "🏍️", "🔑", "🌻", "🐬", "🍄",
  ];

  // Fisher-Yates: baraja una copia del arreglo (no muta el original).
  function barajar(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let rol = null; // "dueno" | "empleado"
  let listo = window.OCSecure.migrarSiHaceFalta(); // promesa: migra oc_auth viejo (si existe) sin perder lo que José ya configuró

  // ---------- CSS ----------
  const css = document.createElement("style");
  css.textContent = `
  #oc-gate{position:fixed;inset:0;z-index:9999;background:var(--azul-oscuro,#1c3049);
    display:flex;align-items:center;justify-content:center;padding:20px;}
  #oc-gate .caja{background:var(--blanco-calido,#fbf5e8);border:2px solid var(--brass,#9c7a35);
    border-radius:8px;padding:26px 22px;max-width:420px;width:100%;text-align:center;}
  #oc-gate h2{font-family:var(--font-display,sans-serif);color:var(--ink,#211c14);font-size:22px;margin:0 0 4px;}
  #oc-gate .sub{font-size:14px;color:var(--ink-soft,#5d5340);margin-bottom:18px;}
  .oc-slots{display:flex;gap:10px;justify-content:center;margin-bottom:16px;}
  .oc-slots .slot{width:58px;height:58px;border:2px solid var(--azul-medio,#2c4a68);border-radius:6px;
    display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--crema,#f3e8cd);color:var(--ink,#211c14);}
  .oc-slots .slot.lleno{border-color:var(--rust,#b2461f);}
  .oc-pad{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
  .oc-pad button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
    padding:8px 4px;border:2px solid var(--ink,#211c14);border-radius:6px;background:var(--crema,#f3e8cd);
    cursor:pointer;min-height:54px;}
  .oc-pad button .dig{font-family:var(--font-display,sans-serif);font-weight:700;font-size:20px;color:var(--ink,#211c14);line-height:1;}
  .oc-pad button .emo{font-size:13px;line-height:1;}
  .oc-pad button:active{transform:translateY(1px);}
  .oc-acciones{display:flex;gap:8px;margin-top:14px;}
  .oc-acciones button{flex:1;font-family:var(--font-display,sans-serif);font-size:14px;padding:12px;
    border-radius:6px;border:2px solid var(--azul-medio,#2c4a68);background:var(--blanco-calido,#fbf5e8);
    color:var(--azul-medio,#2c4a68);cursor:pointer;min-height:44px;text-transform:uppercase;}
  .oc-msg{min-height:20px;font-size:14px;font-weight:700;color:var(--rojo,#a3392a);margin-top:12px;}
  #oc-gate.err .caja,.oc-subgate.err .caja{animation:ocshake .35s;}
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
  .oc-subgate{position:fixed;inset:0;z-index:9999;background:rgba(28,48,73,0.92);
    display:flex;align-items:center;justify-content:center;padding:20px;}
  `;
  document.head.appendChild(css);

  // ---------------------------------------------------------------------------
  // Construye un teclado de PIN reutilizable (lo usan el candado principal y el
  // de la subclave contable). Cada vez que se llama, BARAJA los emojis de
  // adorno entre las teclas. Las teclas muestran el dígito (lo que el usuario
  // toca) más emojis decorativos.
  //   padEl   : contenedor del grid de teclas
  //   slotsEl : contenedor de las 3 casillas (se enmascaran con ●)
  //   onComplete(code) : callback cuando se ingresan 3 dígitos
  // Devuelve un objeto { reset } para limpiar la entrada.
  // ---------------------------------------------------------------------------
  function montarTeclado(padEl, slotsEl, onComplete) {
    let entrada = [];
    const pool = barajar(EMOJI_POOL); // adorno barajado por sesión de teclado
    // Render de teclas 0-9 (dígitos en orden, visibles). A cada tecla le toca
    // un emoji distinto del pool barajado (intercambiable, no fijo por dígito).
    padEl.innerHTML = "";
    for (let d = 0; d <= 9; d++) {
      const b = document.createElement("button");
      b.dataset.d = String(d);
      b.innerHTML = `<span class="dig">${d}</span><span class="emo">${pool[d % pool.length]}</span>`;
      padEl.appendChild(b);
    }
    const slots = () => slotsEl.querySelectorAll(".slot");
    function pintar() {
      slots().forEach((s, i) => {
        if (entrada[i] != null) { s.textContent = "●"; s.classList.add("lleno"); } // enmascarado: no delata
        else { s.textContent = ""; s.classList.remove("lleno"); }
      });
    }
    // BUG FIJADO: montarTeclado() se vuelve a llamar en cada reintento (un PIN
    // equivocado re-baraja el teclado). Antes esto hacía padEl.addEventListener
    // de nuevo cada vez, ACUMULANDO listeners sobre el mismo nodo persistente
    // (#oc-pad / #oc-pad2 nunca se recrean, solo su innerHTML). Resultado: tras
    // N intentos fallidos, el siguiente PIN correcto disparaba validar()/
    // alCompletar() N+1 veces en paralelo. Fix: el listener se monta UNA sola
    // vez por nodo (guardado en un dataset flag) y lee el callback/estado
    // vigente desde padEl._ocTeclado, que cada llamada a montarTeclado() sí
    // reemplaza por completo.
    padEl._ocTeclado = { entrada: () => entrada, push: (d) => entrada.push(d), pintar, onComplete };
    if (!padEl.dataset.ocListenerMontado) {
      padEl.dataset.ocListenerMontado = "1";
      padEl.addEventListener("click", (e) => {
        const st = padEl._ocTeclado; // siempre el estado de la montada MÁS RECIENTE
        const b = e.target.closest("button[data-d]"); if (!b || st.entrada().length >= 3) return;
        st.push(Number(b.dataset.d));
        st.pintar();
        if (st.entrada().length === 3) { const code = st.entrada().join(""); setTimeout(() => st.onComplete(code), 150); }
      });
    }
    pintar();
    return { reset: () => { entrada = []; pintar(); } };
  }

  // ---------- Candado principal (DUEÑO / EMPLEADO) ----------
  const gate = document.createElement("div");
  gate.id = "oc-gate";
  gate.innerHTML = `
    <div class="caja">
      <h2>Olimpo Control</h2>
      <div class="sub">Toca tu clave de 3 dígitos para entrar</div>
      <div class="oc-slots" id="oc-slots"><div class="slot"></div><div class="slot"></div><div class="slot"></div></div>
      <div class="oc-pad" id="oc-pad"></div>
      <div class="oc-acciones">
        <button id="oc-borrar">Borrar</button>
        <button id="oc-recuperar">¿Olvidaste?</button>
      </div>
      <div class="oc-msg" id="oc-msg"></div>
    </div>`;
  document.body.appendChild(gate);

  let teclado = null;
  function nuevoTeclado() {
    // Re-monta el teclado (re-baraja emojis) cada vez que aparece el candado.
    teclado = montarTeclado($("oc-pad"), $("oc-slots"), validar);
  }
  function $(id) { return document.getElementById(id); }

  function error(txt) {
    $("oc-msg").style.color = "var(--rojo,#a3392a)";
    $("oc-msg").textContent = txt;
    gate.classList.add("err");
    setTimeout(() => gate.classList.remove("err"), 400);
    nuevoTeclado(); // limpia y re-baraja
  }
  async function validar(code) {
    await listo;
    if (await window.OCSecure.verificarOwner(code)) return entrar("dueno");
    if (await window.OCSecure.verificarEmpleado(code)) return entrar("empleado");
    error("Clave incorrecta. Intenta de nuevo.");
  }
  function entrar(nuevoRol) {
    rol = nuevoRol;
    document.body.classList.toggle("rol-empleado", rol === "empleado");
    document.body.classList.toggle("rol-dueno", rol === "dueno");
    gate.style.display = "none";
    montarLogout();
    if (rol === "empleado") { const n = document.querySelector('nav button[data-vista="hoy"]'); if (n) n.click(); }
    window.dispatchEvent(new CustomEvent("oc-login", { detail: { rol } }));
  }

  $("oc-borrar").addEventListener("click", () => { $("oc-msg").textContent = ""; if (teclado) teclado.reset(); });
  $("oc-recuperar").addEventListener("click", async () => {
    await listo;
    const email = window.OCSecure.leerCorreo();
    if (!email) { $("oc-msg").style.color = "var(--ink-soft,#5d5340)"; $("oc-msg").textContent = "No hay correo de recuperación configurado. Pídele al dueño que lo registre en Avanzado."; return; }
    $("oc-msg").style.color = "var(--verde,#2f7a4f)";
    $("oc-msg").textContent = `Se enviaría un enlace de recuperación a ${enmascarar(email)} (demo: no se envía correo real).`;
  });
  nuevoTeclado();

  // ---------- Logout en el header ----------
  function montarLogout() {
    if (document.getElementById("oc-logout")) return;
    const header = document.querySelector("header");
    if (!header) return;
    const b = document.createElement("button");
    b.id = "oc-logout"; b.textContent = "Salir";
    b.addEventListener("click", () => {
      rol = null; document.body.classList.remove("rol-empleado", "rol-dueno");
      $("oc-msg").textContent = ""; nuevoTeclado();
      gate.style.display = "flex"; b.remove();
    });
    header.appendChild(b);
  }

  // ---------- Utilidades ----------
  // Ofusca un correo: primera letra + puntos + dominio (j•••@gmail.com).
  function enmascarar(email) {
    const [u, dom] = String(email).split("@");
    if (!dom) return "•••";
    return `${u.slice(0, 1)}${"•".repeat(Math.max(2, u.length - 1))}@${dom}`;
  }

  // Expuesto para la vista Avanzado (capa contable).
  window.OCAuth = {
    rolActual: () => rol,
    enmascarar,
    listo: () => listo,
    // Pide la subclave contable con su propio teclado (emojis barajados, casillas enmascaradas).
    pedirSubclaveContable() {
      return new Promise((resolve) => {
        const cont = document.createElement("div");
        cont.className = "oc-subgate";
        cont.innerHTML = `<div class="caja" style="background:var(--blanco-calido,#fbf5e8);border:2px solid var(--brass,#9c7a35);border-radius:8px;padding:26px 22px;max-width:420px;width:100%;text-align:center;">
          <h2 style="font-family:var(--font-display,sans-serif);color:var(--ink,#211c14);font-size:22px;margin:0 0 4px;">Capa contable</h2>
          <div class="sub" style="font-size:14px;color:var(--ink-soft,#5d5340);margin-bottom:18px;">Subclave de 3 dígitos para ver cuentas T, P&amp;G y balance</div>
          <div class="oc-slots" id="oc-slots2"><div class="slot"></div><div class="slot"></div><div class="slot"></div></div>
          <div class="oc-pad" id="oc-pad2"></div>
          <div class="oc-acciones"><button id="sc-cancelar">Cancelar</button><button id="sc-borrar">Borrar</button></div>
          <div class="oc-msg" id="oc-msg2"></div></div>`;
        document.body.appendChild(cont);
        let tec;
        async function alCompletar(code) {
          if (await window.OCSecure.verificarAcct(code)) { cont.remove(); resolve(true); }
          else {
            cont.querySelector("#oc-msg2").textContent = "Subclave incorrecta.";
            cont.classList.add("err"); setTimeout(() => cont.classList.remove("err"), 400);
            tec = montarTeclado(cont.querySelector("#oc-pad2"), cont.querySelector("#oc-slots2"), alCompletar); // re-baraja
          }
        }
        tec = montarTeclado(cont.querySelector("#oc-pad2"), cont.querySelector("#oc-slots2"), alCompletar);
        cont.querySelector("#sc-borrar").addEventListener("click", () => tec.reset());
        cont.querySelector("#sc-cancelar").addEventListener("click", () => { cont.remove(); resolve(false); });
      });
    },
  };
})();
