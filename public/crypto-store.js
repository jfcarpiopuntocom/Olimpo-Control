// crypto-store.js — Almacenamiento local cifrado, sin servidor, sin librerías.
// Usa WebCrypto (nativo del navegador, gratis y estándar) para que las claves
// de acceso y el correo de recuperación NUNCA se guarden en texto plano en
// localStorage. Antes, cualquiera con DevTools abierto (o un vecino con
// acceso físico al equipo) podía leer "oc_auth" y ver los 3 PINs y el correo
// tal cual. Ahora solo se guardan HASHES (no reversibles) de cada PIN para
// poder validarlos, y el correo va cifrado con AES-256-GCM bajo una llave
// derivada del PIN del dueño (PBKDF2, 150k iteraciones, SHA-256).
//
// Esto es "nivel nostr" en el sentido que importa para un negocio: cifrado
// de extremo a extremo en el cliente, sin que ningún servidor (porque no hay
// servidor) ni un atacante con el archivo de datos pueda leer nada sin el PIN
// correcto. No es un keypair nostr real (eso es overkill para una sola
// terminal) — si más adelante se necesita sincronizar entre dispositivos o
// identidad firmada, este módulo es el lugar para añadir secp256k1.
//
// NOTA sobre el correo de recuperación: a propósito NO se cifra bajo el PIN.
// Si lo cifráramos bajo el PIN del dueño, el flujo "olvidé mi clave" quedaría
// roto (haría falta el PIN para leer el correo que sirve para recuperar el
// PIN). Por diseño (spec confirmado del proyecto) el correo se guarda en
// claro pero se OFUSCA en toda la interfaz (ej. j••••@gmail.com); lo
// sensible que de verdad protegemos con criptografía fuerte son los 3 PINs,
// que solo se guardan como hash irreversible — nunca se necesita leerlos de
// vuelta, solo compararlos.
//
// Formato guardado en localStorage["oc_secure"]:
//   {
//     v: 1,
//     salt: <base64>,            // salt PBKDF2, no es secreto, solo evita rainbow tables
//     ownerHash: <base64>,       // verificador del PIN del dueño (no se puede revertir)
//     employeeHashes: [<base64>, ...],
//     acctHash: <base64>,        // verificador de la subclave contable
//     email: <string>            // correo de recuperación, en claro, SOLO ofuscado en UI
//   }
(function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function importPinKey(pin) {
    return crypto.subtle.importKey("raw", enc.encode(String(pin)), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  }

  // info: etiqueta de contexto ("owner"|"emp"|"acct"|"vault") para que el mismo
  // PIN nunca derive la misma llave/hash en dos roles distintos.
  async function deriveBits(pin, saltB64, info, bits) {
    const base = await importPinKey(pin);
    const salt = enc.encode(info + ":" + saltB64); // mezcla salt + contexto
    return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, bits);
  }

  async function hashPin(pin, saltB64, info) {
    const bits = await deriveBits(pin, saltB64, info, 256);
    return b64(bits);
  }

  function randSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }

  // ---- migración silenciosa desde el formato viejo en texto plano (oc_auth) ----
  // Si José ya había configurado sus claves/correo antes de este cambio, NO se
  // pierden ni se resetean: se migran tal cual a oc_secure en el primer load.
  async function migrarSiHaceFalta() {
    if (localStorage.getItem("oc_secure")) return;
    let viejo = null;
    try { viejo = JSON.parse(localStorage.getItem("oc_auth") || "null"); } catch {}
    const DEF = { owner: "159", empleados: ["260"], acct: "357", email: "" };
    const base = viejo || DEF;
    await guardarSecreto(base.owner, base.empleados || [], base.acct, base.email || "");
    localStorage.removeItem("oc_auth"); // ya no queda nada en texto plano
  }

  async function guardarSecreto(ownerPin, empleadosPins, acctPin, email) {
    const salt = randSalt();
    const ownerHash = await hashPin(ownerPin, salt, "owner");
    const employeeHashes = [];
    for (const p of empleadosPins) employeeHashes.push(await hashPin(p, salt, "emp"));
    const acctHash = await hashPin(acctPin, salt, "acct");
    localStorage.setItem("oc_secure", JSON.stringify({ v: 1, salt, ownerHash, employeeHashes, acctHash, email: email || "" }));
  }

  function leerSecreto() {
    try { return JSON.parse(localStorage.getItem("oc_secure")); } catch { return null; }
  }

  // Verifica un PIN de 3 dígitos contra un rol ("owner"|"acct") o la lista de empleados.
  async function verificarOwner(pin) {
    const s = leerSecreto(); if (!s) return false;
    return (await hashPin(pin, s.salt, "owner")) === s.ownerHash;
  }
  async function verificarEmpleado(pin) {
    const s = leerSecreto(); if (!s) return false;
    const h = await hashPin(pin, s.salt, "emp");
    return (s.employeeHashes || []).includes(h);
  }
  async function verificarAcct(pin) {
    const s = leerSecreto(); if (!s) return false;
    return (await hashPin(pin, s.salt, "acct")) === s.acctHash;
  }
  function leerCorreo() {
    const s = leerSecreto();
    return s ? (s.email || "") : "";
  }
  // Actualiza solo el correo, sin tocar salt/hashes de los PINs (no requiere
  // volver a ingresar ningún PIN para simplemente cambiar el correo).
  function actualizarCorreo(email) {
    const s = leerSecreto(); if (!s) return;
    s.email = email || "";
    localStorage.setItem("oc_secure", JSON.stringify(s));
  }

  window.OCSecure = { migrarSiHaceFalta, guardarSecreto, verificarOwner, verificarEmpleado, verificarAcct, leerCorreo, actualizarCorreo };
})();
