// help-ui.js — Botón de ayuda (?) flotante. Contenido DISTINTO según el rol
// activo (dueño vs empleado): el dueño necesita entender todo el sistema
// (capa contable, claves, gastos); el empleado solo necesita lo operativo del
// día a día (escanear, vender, leer el semáforo). Depende de auth-ui.js
// (escucha el evento "oc-login" para saber qué rol mostrar).
(function () {
  const css = document.createElement("style");
  css.textContent = `
  #oc-help-btn{position:fixed;right:16px;bottom:calc(var(--nav-h,78px) + 16px);z-index:500;
    width:48px;height:48px;border-radius:50%;border:2px solid var(--azul-oscuro,#1c3049);
    background:var(--gold,#e8a020);color:var(--azul-oscuro,#1c3049);font-family:var(--font-display,sans-serif);
    font-weight:700;font-size:22px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.35);}
  #oc-help-btn:active{transform:scale(0.95);}
  #oc-help-modal{position:fixed;inset:0;z-index:9998;background:rgba(28,48,73,.85);
    display:none;align-items:flex-end;justify-content:center;padding:0;}
  #oc-help-modal.abierto{display:flex;}
  #oc-help-sheet{background:var(--blanco-calido,#fbf5e8);width:100%;max-width:520px;max-height:82vh;
    overflow-y:auto;border-radius:16px 16px 0 0;padding:22px 20px 28px;}
  #oc-help-sheet h2{font-family:var(--font-display,sans-serif);color:var(--ink,#211c14);margin:0 0 4px;font-size:22px;}
  #oc-help-sheet .rolTag{display:inline-block;font-size:13px;font-weight:700;padding:3px 10px;border-radius:12px;
    margin-bottom:14px;background:var(--azul-medio,#2c4a68);color:var(--blanco-calido,#fbf5e8);}
  #oc-help-sheet h3{font-family:var(--font-display,sans-serif);color:var(--ink,#211c14);font-size:16px;margin:18px 0 6px;}
  #oc-help-sheet p, #oc-help-sheet li{font-size:15px;color:var(--ink-soft,#5d5340);line-height:1.5;}
  #oc-help-sheet ul{margin:0 0 4px;padding-left:20px;}
  #oc-help-cerrar{margin-top:18px;width:100%;padding:12px;border-radius:8px;border:2px solid var(--azul-medio,#2c4a68);
    background:var(--azul-medio,#2c4a68);color:var(--blanco-calido,#fbf5e8);font-family:var(--font-display,sans-serif);
    font-size:15px;cursor:pointer;min-height:44px;}
  `;
  document.head.appendChild(css);

  // Contenido del DUEÑO: cubre todo el sistema, incluida la capa contable y
  // la seguridad de las claves — es quien decide y necesita el panorama completo.
  const AYUDA_DUENO = `
    <span class="rolTag">Guía del dueño</span>
    <h3>Tu semáforo (pestaña Hoy)</h3>
    <ul>
      <li><b>Verde</b>: todo sano. <b>Amarillo</b>: revisar pronto. <b>Rojo</b>: reponer ya. <b>Azul</b>: buen margen, impúlsalo.</li>
      <li>Ahí ves de un vistazo cuánto entró, cuánto salió y qué productos piden atención hoy.</li>
    </ul>
    <h3>Inventario y Escanear</h3>
    <ul>
      <li>Escanea o busca un producto para vender una unidad o ajustar el stock (entradas, mermas, conteos).</li>
      <li>Cada ajuste queda registrado en Actividad, con motivo y quién lo hizo.</li>
    </ul>
    <h3>Etiquetas</h3>
    <li>Genera e imprime etiquetas con código de barras + QR para cada producto nuevo.</li>
    <h3>Avanzado (solo tú lo ves)</h3>
    <ul>
      <li><b>Gastos mensuales</b>: arriendo, luz, sueldos. Se reparte entre 30 para estimar el gasto del día.</li>
      <li><b>Capa contable</b> (candado aparte): cuentas T, pérdidas y ganancias, balance e inventario valorizado. Pide tu subclave contable, distinta de tu clave de entrada.</li>
      <li><b>Acceso y recuperación</b>: registra tu correo ANTES de cambiar tus claves — sin correo guardado no hay forma de recuperar un código que olvides. Los códigos viejos nunca se muestran (se guardan cifrados); solo escribes los nuevos.</li>
    </ul>
    <h3>Seguridad</h3>
    <p>Tus 3 claves (dueño, empleado, contable) se guardan cifradas en este dispositivo, nunca en texto plano. El teclado muestra dígitos con un emoji decorativo que cambia cada vez — no delata tu código a quien mire por encima del hombro.</p>
  `;

  // Contenido del EMPLEADO: solo lo operativo del turno. Sin mención a claves,
  // gastos ni contabilidad — esa capa ni siquiera le aparece en el menú.
  const AYUDA_EMPLEADO = `
    <span class="rolTag">Guía del empleado</span>
    <h3>Tu día a día</h3>
    <ul>
      <li><b>Hoy</b>: mira el semáforo del negocio. Rojo = ese producto necesita reponerse pronto, avísale al dueño.</li>
      <li><b>Escanear</b>: apunta la cámara al código de barras o QR, o escribe el código a mano si la etiqueta está dañada.</li>
      <li><b>Vender</b>: al escanear un producto, toca "Vender 1" para descontar del stock al momento.</li>
      <li><b>Ajustar</b>: si algo se rompió, se venció o contaste mal el stock, usa "Ajustar" y escribe el motivo — queda registrado con tu turno.</li>
      <li><b>Etiquetas</b>: si necesitas reimprimir una etiqueta perdida o dañada, la encuentras aquí por nombre o código.</li>
    </ul>
    <h3>Lo que no necesitas</h3>
    <p>Los reportes financieros y la configuración del negocio los maneja el dueño — no aparecen en tu vista, y está bien así: tu trabajo es vender bien y mantener el inventario al día.</p>
  `;

  const modal = document.createElement("div");
  modal.id = "oc-help-modal";
  modal.innerHTML = `<div id="oc-help-sheet">
    <h2>¿Cómo funciona Olimpo Control?</h2>
    <div id="oc-help-body"></div>
    <button id="oc-help-cerrar">Entendido</button>
  </div>`;
  document.body.appendChild(modal);

  const btn = document.createElement("button");
  btn.id = "oc-help-btn";
  btn.textContent = "?";
  btn.title = "Ayuda";
  btn.style.display = "none"; // aparece solo tras iniciar sesión (ver oc-login)
  document.body.appendChild(btn);

  function abrir() {
    const rol = window.OCAuth ? window.OCAuth.rolActual() : null;
    document.getElementById("oc-help-body").innerHTML = rol === "empleado" ? AYUDA_EMPLEADO : AYUDA_DUENO;
    modal.classList.add("abierto");
  }
  btn.addEventListener("click", abrir);
  document.getElementById("oc-help-cerrar").addEventListener("click", () => modal.classList.remove("abierto"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("abierto"); });

  window.addEventListener("oc-login", () => { btn.style.display = "flex"; btn.style.alignItems = "center"; btn.style.justifyContent = "center"; });
})();
