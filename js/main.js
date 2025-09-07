window.handleSocialAppWebViewUI && window.handleSocialAppWebViewUI();

// Esperar a que window.getAccessToken esté disponible antes de ejecutar el resto de main.js
(function waitForAuth0Ready() {
  if (window.getAccessToken && typeof window.getAccessToken === 'function') {
    mainVallaBus();
  } else {
    setTimeout(waitForAuth0Ready, 50);
  }
})();

// Asegurarse de que el modal de privacidad esté oculto desde el principio
(function hidePrivacyModalImmediately() {
  const privacyModal = document.getElementById('privacyModal');
  if (privacyModal) {
    privacyModal.classList.add('hidden');
  }
})();

function mainVallaBus() {
  document.addEventListener('DOMContentLoaded', function() {
    // --- Variables y elementos principales ---
    const micBtn = document.getElementById('micBtn');
    const micIcon = document.getElementById('micIcon');
    const info = document.getElementById('info');
    const keyboardBtn = document.getElementById('keyboardBtn');
    const textInputForm = document.getElementById('textInputForm');
    const textInput = document.getElementById('textInput');
    const speakerBtn = document.getElementById('speakerBtn');
    let voices = [];
    let recognizing = false;
    let recognition;
    let respuestaPendiente = null;
    let recognitionEnded = true;
    let utteranceActual = null;
    let speakLongTextCancelado = false;
    let esperaLecturaPorVoz = false; // Flag para lectura automática tras tap micrófono
    let lastUserQuestion = null;
    let locationPermissionAsked = false;
    let wasAuthenticated = false; // Nuevo flag para detectar transición de login
    let esperandoRespuestaBot = false; // Nuevo: flag para bloquear envíos múltiples

    // --- Detección estricta de soporte Speech API ---
    function isSpeechApiReallySupported() {
      try {
        if ('webkitSpeechRecognition' in window) {
          new window.webkitSpeechRecognition();
          return true;
        }
        if ('SpeechRecognition' in window && typeof window.SpeechRecognition === 'function') {
          new window.SpeechRecognition();
          return true;
        }
      } catch (e) {
        return false;
      }
      return false;
    }

    const speechSupported = isSpeechApiReallySupported();
    if (!speechSupported) {
      if (micBtn) {
        micBtn.style.display = 'none';
      }
      if (keyboardBtn) {
        keyboardBtn.style.display = 'none';
      }
      if (textInputForm) {
        textInputForm.style.display = '';
      }
      if (textInput) {
        textInput.focus();
      }
      if (info) {
        info.style.display = 'none';
      }
      document.body.classList.add('text-mode-only');
    }

    // Tooltip para el input de texto si no hay Speech API
    let tooltipDiv = null;
    function showTextInputTooltip() {
      if (tooltipDiv) return;
      tooltipDiv = document.createElement('div');
      tooltipDiv.className = 'textinput-tooltip';
      tooltipDiv.style.position = 'absolute';
      tooltipDiv.style.top = '-70px';
      tooltipDiv.style.left = '0';
      tooltipDiv.style.padding = '6px 12px';
      tooltipDiv.style.borderRadius = '8px';
      tooltipDiv.style.fontSize = '1.1em';
      tooltipDiv.style.zIndex = 100;
      tooltipDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      tooltipDiv.style.display = 'flex';
      tooltipDiv.style.alignItems = 'center';
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        tooltipDiv.style.background = '#355347';
        tooltipDiv.style.color = '#b7e4c7';
      } else {
        tooltipDiv.style.background = '#228b54';
        tooltipDiv.style.color = '#fff';
      }
      tooltipDiv.innerHTML = 'Usa el <i class="fa-solid fa-microphone mr-1 ml-1"></i> de tu teclado para dictar por voz';
      const parent = textInput && textInput.parentElement;
      if (parent) {
        parent.style.position = 'relative';
        parent.appendChild(tooltipDiv);
      }
    }
    function hideTextInputTooltip() {
      if (tooltipDiv) {
        tooltipDiv.remove();
        tooltipDiv = null;
      }
    }
    if (!speechSupported && textInput) {
      // Mostrar tooltip la primera vez automáticamente
      setTimeout(() => {
        textInput.focus();
        showTextInputTooltip();
      }, 100);
      textInput.addEventListener('focus', showTextInputTooltip);
      textInput.addEventListener('blur', hideTextInputTooltip);
    }

    // Generar un id de sesión único por carga de la webapp
    function getSessionId() {
      if (window._sessionId) return window._sessionId;
      if (window.crypto && window.crypto.randomUUID) {
        window._sessionId = crypto.randomUUID();
      } else {
        window._sessionId = 's-' + Math.random().toString(36).slice(2) + Date.now();
      }
      return window._sessionId;
    }
    const sessionId = getSessionId();
    // Cargar voces
    function loadVoices() {
      voices = window.speechSynthesis.getVoices();
    }
    window.speechSynthesis.onvoiceschanged = loadVoices;
    loadVoices();
    // --- Solicitar ubicación al cargar la app SOLO si está logeado ---
    // Toda la lógica de ubicación se gestiona en js/ubicacion.js
    function waitForAuth0ClientAndStartUbicacion_LOG() {
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        window.ubicacion.iniciarWatcherUbicacion();
      } else {
        setTimeout(waitForAuth0ClientAndStartUbicacion_LOG, 50);
      }
    }
    if (window.ubicacion && typeof window.ubicacion.iniciarWatcherUbicacion === 'function') {
      waitForAuth0ClientAndStartUbicacion_LOG();
    } else {
      const checkUbicacion = setInterval(function() {
        if (window.ubicacion && typeof window.ubicacion.iniciarWatcherUbicacion === 'function') {
          clearInterval(checkUbicacion);
          waitForAuth0ClientAndStartUbicacion_LOG();
        }
      }, 100);
    }
    // --- Utilidad para construir headers con token si existe ---
    async function construirHeaders() {
      let headers = { 'Content-Type': 'application/json' };
      if (window.getAccessToken) {
        try {
          const token = await window.getAccessToken();
          if (token && typeof token === 'string' && token.split('.').length === 3) {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            // Si no hay token, solo ocultar controles y mostrar login
            window.mostrarSoloLogin && window.mostrarSoloLogin();
            return null;
          }
        } catch (e) {
          // Si hay error al obtener token, solo ocultar controles y mostrar login
          window.mostrarSoloLogin && window.mostrarSoloLogin();
          return null;
        }
      }
      return headers;
    }

    // --- Utilidad para añadir ubicación si está disponible ---
    function añadirUbicacionSiDisponible(bodyObj) {
      const ubic = window.ubicacion && window.ubicacion.getUserLocation ? window.ubicacion.getUserLocation() : null;
      if (ubic && typeof ubic.latitud === 'number' && typeof ubic.longitud === 'number') {
        bodyObj.latitud = ubic.latitud;
        bodyObj.longitud = ubic.longitud;
      }
    }
    // --- Utilidad para mostrar error de bot ---
    function mostrarErrorBot(info, textInputForm) {
      removeThinkingPlaceholder();
      document.getElementById('loader').style.display = 'none';
      esperandoRespuestaBot = false; // Permitir nuevos envíos tras error
      
      // Verificar si el botón de login está visible
      const loginBtn = document.getElementById('main-login-btn');
      const isLoginVisible = loginBtn && loginBtn.style.display !== 'none';
      
      if (!isLoginVisible) {
        // Solo habilitar controles si el usuario está autenticado
        setControlesUsuarioActivos(true);
      } else {
        // Si hay botón de login visible, asegurarse que los controles permanezcan ocultos
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      
      if (textInputForm && textInputForm.style.display === 'none' && info) info.style.display = '';
      const errorMsg = getErrorWithRestartButton();
      addMessage(errorMsg, 'bot', getErrorWithRestartButton.voice);
    }

    // --- Unifica la gestión de errores de autenticación y token para fetchs del bot ---
    function handleAuthErrorAndShowLogin({forceHideAll = false} = {}) {
      removeThinkingPlaceholder();
      document.getElementById('loader').style.display = 'none';
      esperandoRespuestaBot = false;
      // No activar controles aquí, ya que mostrarSoloLogin se encargará de ocultarlos
      
      // Oculta todos los controles SIEMPRE, no solo si ya existe el botón
      const info = document.getElementById('info');
      const textInputForm = document.getElementById('textInputForm');
      const loader = document.getElementById('loader');
      const stopBtn = document.getElementById('stopBtn');
      const speakerBtn = document.getElementById('speakerBtn');
      const micBtn = document.getElementById('micBtn');
      const keyboardBtn = document.getElementById('keyboardBtn');
      if (info) info.style.display = 'none';
      if (textInputForm) textInputForm.style.display = 'none';
      if (loader) loader.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'none';
      if (speakerBtn) speakerBtn.style.display = 'none';
      if (micBtn) micBtn.style.display = 'none';
      if (keyboardBtn) keyboardBtn.style.display = 'none';
      let loginMainBtn = document.getElementById('main-login-btn');
      if (!loginMainBtn) {
        loginMainBtn = document.createElement('button');
        loginMainBtn.id = 'main-login-btn';
        loginMainBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Inicia sesión o regístrate';
        loginMainBtn.className = 'login-main-btn';
        loginMainBtn.onclick = () => window.auth0Client && window.auth0Client.loginWithRedirect && window.auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });
        const bottomBar = document.querySelector('.fixed-bottom-bar');
        if (bottomBar) bottomBar.appendChild(loginMainBtn);
        else document.body.appendChild(loginMainBtn);
      } else {
        loginMainBtn.style.display = 'block';
      }
    }

    // --- Lógica centralizada para enviar mensaje al bot y gestionar errores de autenticación ---
    async function enviarMensajeAlBot({texto, sessionId, infoRef, textInputFormRef}) {
      let bodyObj = { texto, session_id: sessionId };
      añadirUbicacionSiDisponible(bodyObj);
      let body = JSON.stringify(bodyObj);
      let headers = await construirHeaders();
      if (!headers || !headers['Authorization']) {
        handleAuthErrorAndShowLogin({forceHideAll: true});
        return;
      }
      try {
        const res = await fetch('https://tasks.nukeador.com/webhook/vallabus-guia', {
          method: 'POST',
          headers,
          body
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            handleAuthErrorAndShowLogin({forceHideAll: true});
            return;
          }
          throw new Error('Error en la respuesta: ' + res.status);
        }
        const data = await res.json();
        handleBotResponse(data, {infoRef, textInputFormRef});
      } catch {
        mostrarErrorBot(infoRef, textInputFormRef);
        esperandoRespuestaBot = false;
        setControlesUsuarioActivos(true);
        return;
      }
    }

    // Reconocimiento de voz
    function startRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        info.textContent = 'Tu navegador no soporta reconocimiento de voz.';
        return;
      }
      recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
      recognition.lang = 'es-ES';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        recognizing = true;
        recognitionEnded = false;
        micBtn.classList.add('recording');
        info.textContent = 'Escuchando... Pulsa para parar';
      };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        info.textContent = '';
        document.getElementById('loader').style.display = 'flex';
        // Mostrar pregunta detectada
        (function() {
          addMessage(transcript, 'user');
          recognition.stop(); // Detener reconocimiento inmediatamente
          showThinkingPlaceholder();
          enviarMensajeAlBot({
            texto: transcript,
            sessionId,
            infoRef: info,
            textInputFormRef: textInputForm
          });
        })();
      };
      recognition.onerror = (event) => {
        info.textContent = 'Error: ' + event.error;
        recognizing = false;
        micBtn.classList.remove('recording');
      };
      recognition.onend = () => {
        recognizing = false;
        recognitionEnded = true;
        micBtn.classList.remove('recording');
        if (respuestaPendiente) {
          speakLongText(respuestaPendiente);
          respuestaPendiente = null;
        }
      };
      recognition.start();
    }
    function splitTextForSpeech(text) {
      // Divide por frases y luego por fragmentos de máximo 200 caracteres
      let rawFrases = text.split(/(?<=[.!?;:,\n])\s+/g);
      let frases = [];
      rawFrases.forEach(f => {
        let frase = f.trim();
        while (frase.length > 200) {
          let corte = frase.lastIndexOf(' ', 200);
          if (corte === -1) corte = 200;
          frases.push(frase.slice(0, corte));
          frase = frase.slice(corte).trim();
        }
        if (frase.length > 0) frases.push(frase);
      });
      return frases;
    }

    function speakLongText(text) {
      if (!speakerActive) return; // No leer en alto si está desactivado
      const frases = splitTextForSpeech(text);
      let idx = 0;
      speakLongTextCancelado = false;
      setSpeakingState(true);
      // Selección simple: primera voz española disponible
      function getBestSpanishVoice() {
        if (!voices || !voices.length) return null;
        const vocesEs = voices.filter(v => v.lang && v.lang.startsWith('es'));
        if (vocesEs.length > 0) return vocesEs[0];
        return null;
      }
      const vozElegida = getBestSpanishVoice();
      function speakNext() {
        if (speakLongTextCancelado || idx >= frases.length) {
          setSpeakingState(false);
          return;
        }
        let frase = frases[idx].trim();
        if (frase.includes('___ENLACE___')) {
          frase = 'Consulta el enlace.';
        }
        utteranceActual = new SpeechSynthesisUtterance(frase);
        utteranceActual.lang = 'es-ES';
        if (vozElegida) utteranceActual.voice = vozElegida;
        utteranceActual.volume = 1;
        utteranceActual.rate = 1;
        utteranceActual.pitch = 1;
        utteranceActual.onstart = () => { setSpeakingState(true); };
        utteranceActual.onend = () => {
          utteranceActual = null;
          idx++;
          if (speakLongTextCancelado) { setSpeakingState(false); return; }
          speakNext();
        };
        utteranceActual.onerror = (e) => {
          utteranceActual = null;
          idx++;
          if (speakLongTextCancelado) { setSpeakingState(false); return; }
          speakNext();
        };
        window.speechSynthesis.speak(utteranceActual);
      }
      speakNext();
    }
    // --- Alternar modo texto/micrófono ---

    function setTextMode(active) {
      const info = document.getElementById('info');
      const speakerBtn = document.getElementById('speakerBtn');
      // No mostrar controles si hay botón de login visible (usuario no autenticado)
      const loginBtn = document.getElementById('main-login-btn');
      const isLoginVisible = loginBtn && loginBtn.style.display !== 'none';
      
      if (isLoginVisible) {
        // Si hay botón de login visible, no hacer nada (mantener ocultos los controles)
        return;
      }
      
      if (active) {
        micBtn.style.display = 'none';
        keyboardBtn.style.display = 'none'; // Ocultamos el botón de teclado en modo texto
        if (speakerBtn) speakerBtn.style.display = 'none';
        textInputForm.style.display = '';
        if (info) info.style.display = 'none';
        // También ocultar info si loader está visible
        const loader = document.getElementById('loader');
        if (loader && loader.style.display !== 'none') info.style.display = 'none';
        textInput.focus();
      } else {
        micBtn.style.display = '';
        keyboardBtn.style.display = '';
        if (speakerBtn) speakerBtn.style.display = '';
        textInputForm.style.display = 'none';
        // Solo mostrar info si loader está oculto y no estamos en modo texto
        const loader = document.getElementById('loader');
        if (info && (!loader || loader.style.display === 'none')) info.style.display = '';
        textInput.value = '';
      }
    }

    keyboardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      setTextMode(true);
    });

    // Listeners de cambio de modo solo si speechSupported
    if (speechSupported) {
      // Al perder foco el input, si está vacío, volver a modo micrófono
      textInput.addEventListener('blur', () => {
        setTimeout(() => {
          if (!textInput.value) setTextMode(false);
        }, 150);
      });
      // Al pulsar ESC, volver a modo micrófono
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          setTextMode(false);
        }
      });
    }

    // --- Control de autenticación centralizado ---
    async function checkAuthAndRedirectIfNeeded() {
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        const isAuthenticated = await window.auth0Client.isAuthenticated();
        if (!isAuthenticated) {
          // Si estaba autenticado y ahora no, forzar UI a estado no logueado
          if (wasAuthenticated) {
            window.mostrarSoloLogin();
          }
          // Ya NO redirigimos automáticamente, solo mostramos login
          return false;
        } else {
          wasAuthenticated = true;
        }
      }
      return true;
    }

    // Oculta todos los controles y muestra solo el login principal (reutilizable globalmente)
    window.mostrarSoloLogin = function mostrarSoloLogin() {
      const info = document.getElementById('info');
      const textInputForm = document.getElementById('textInputForm');
      const loader = document.getElementById('loader');
      const stopBtn = document.getElementById('stopBtn');
      const speakerBtn = document.getElementById('speakerBtn');
      const micBtn = document.getElementById('micBtn');
      const keyboardBtn = document.getElementById('keyboardBtn');
      if (info) info.style.display = 'none';
      if (textInputForm) textInputForm.style.display = 'none';
      if (loader) loader.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'none';
      if (speakerBtn) speakerBtn.style.display = 'none';
      if (micBtn) micBtn.style.display = 'none';
      if (keyboardBtn) keyboardBtn.style.display = 'none';
      let loginMainBtn = document.getElementById('main-login-btn');
      if (!loginMainBtn) {
        loginMainBtn = document.createElement('button');
        loginMainBtn.id = 'main-login-btn';
        loginMainBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Inicia sesión o regístrate';
        loginMainBtn.className = 'login-main-btn';
        loginMainBtn.onclick = () => window.auth0Client && window.auth0Client.loginWithRedirect && window.auth0Client.loginWithRedirect({ authorizationParams: { redirect_uri: window.location.origin } });
        const bottomBar = document.querySelector('.fixed-bottom-bar');
        if (bottomBar) bottomBar.appendChild(loginMainBtn);
        else document.body.appendChild(loginMainBtn);
      } else {
        loginMainBtn.style.display = 'block';
      }
    };

    // --- Habilitar/deshabilitar controles de usuario según estado ---
    function setControlesUsuarioActivos(activo) {
      // Verificar si el botón de login está visible (usuario no autenticado)
      const loginBtn = document.getElementById('main-login-btn');
      const isLoginVisible = loginBtn && loginBtn.style.display !== 'none';
      
      // Si el botón de login está visible, no habilitar controles
      if (isLoginVisible && activo) {
        return;
      }
      
      if (micBtn) micBtn.disabled = !activo;
      if (keyboardBtn) keyboardBtn.disabled = !activo;
      if (textInput) textInput.disabled = !activo;
    }

    // Enviar consulta por texto
    textInputForm.addEventListener('submit', async function(e) {
      if (textInput && textInput.value.length > 500) {
        e.preventDefault();
        textInput.value = textInput.value.slice(0, 500);
        if (document.getElementById('charCounter')) {
          document.getElementById('charCounter').textContent = 0;
        }
        return;
      }
      e.preventDefault();
      if (esperandoRespuestaBot) return; // Bloquear si esperando respuesta
      setControlesUsuarioActivos(false); // Deshabilitar controles
      if (!await checkAuthAndRedirectIfNeeded()) {
        // No activar controles si no está autenticado, mostrar login en su lugar
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      const value = textInput.value.trim();
      if (!value) {
        setControlesUsuarioActivos(true);
        return;
      }
      esperandoRespuestaBot = true; // Bloquear nuevos envíos
      addMessage(value, 'user');
      textInput.value = '';
      if (speechSupported) {
        setTextMode(false);
      }
      // Ocultar "Pulsa para hablar" antes de mostrar loader
      const info = document.getElementById('info');
      if (info) info.style.display = 'none';
      document.getElementById('loader').style.display = 'flex';
      showThinkingPlaceholder();
      await enviarMensajeAlBot({
        texto: value,
        sessionId,
        infoRef: info,
        textInputFormRef: textInputForm
      });
    });

    // Mostrar solo uno de los botones según modo al cargar
    if (speechSupported) {
      setTextMode(false);
    }

    micBtn.addEventListener('click', async () => {
      if (esperandoRespuestaBot) return; // Bloquear si esperando respuesta
      setControlesUsuarioActivos(false); // Deshabilitar controles
      if (!await checkAuthAndRedirectIfNeeded()) {
        // No activar controles si no está autenticado, mostrar login en su lugar
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      // Workaround Safari iOS: despertar SpeechSynthesis
      if (/iP(ad|hone|od)/.test(navigator.userAgent)) {
        try {
          const dummy = new SpeechSynthesisUtterance('.');
          dummy.volume = 0;
          window.speechSynthesis.speak(dummy);
        } catch(e) {}
      }
      speakLongTextCancelado = true; // Igual que el botón detener
      window.speechSynthesis.cancel(); // Detener cualquier voz en curso
      if (recognizing) {
        recognition.stop();
        recognizing = false;
        micBtn.classList.remove('recording');
        info.textContent = 'Procesando...';
      } else {
        startRecognition();
      }
      esperaLecturaPorVoz = true; // Activar flag para lectura automática
    });

    // --- FIN: Lógica de tema eliminada ---

    // Reemplazar la lógica de mostrar mensajes en userBubble/chatBubble por agregar elementos al chatContainer
    function addMessage(text, sender, originalText) {
      const chatContainer = document.getElementById('chatContainer');
      const div = document.createElement('div');
      let inner = text;
      if (sender === 'bot') {
        // Copiar y compartir a la izquierda, manitas a la derecha
        inner = `<div class="msg-bot-inner" style="position:relative;display:flex;flex-direction:column;align-items:stretch;width:100%;">
          <div class='msg-text' style='width:100%;text-align:left;'>${text}</div>
          <div class="msg-actions" style="display:flex;flex-direction:row;align-items:center;justify-content:space-between;width:100%;margin-top:10px;">
            <div class="left-actions" style="display:flex;gap:14px;align-items:center;">
              <button class="copy-btn" title="Copiar" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1em;color:#228b54;opacity:0.55;touch-action:manipulation;" tabindex="0" type="button">
                <i class="fa-regular fa-copy"></i>
              </button>
              <button class="share-btn" title="Compartir" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1em;color:#228b54;opacity:0.55;touch-action:manipulation;" tabindex="0" type="button">
                <i class="fa-solid fa-share-nodes"></i>
              </button>
            </div>
            <div class="feedback-btns" style="display:flex;gap:6px;">
              <button class="thumbs-up-btn" title="Respuesta útil" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1.1em;color:#228b54;opacity:0.55;" tabindex="0" type="button">
                <i class="fa-regular fa-thumbs-up"></i>
              </button>
              <button class="thumbs-down-btn" title="Respuesta no útil" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1.1em;color:#228b54;opacity:0.55;" tabindex="0" type="button">
                <i class="fa-regular fa-thumbs-down"></i>
              </button>
            </div>
          </div>
        </div>`;
      }
      div.className = sender === 'user'
        ? 'chat-bubble user-bubble bg-[#c0d6c5] dark:bg-[#23382b] text-[#1e4636] dark:text-[#eaf7ef] border border-[#d1f2e0] dark:border-[#3a4d44] rounded-2xl px-4 py-2 text-base w-fit self-end shadow-sm max-w-[90%] mb-3 mr-2'
        : 'chat-bubble bg-[#f8fef9] dark:bg-[#2e4d3a] text-[#185d39] dark:text-[#b7e4c7] border border-[#d1f2e0] dark:border-[#3a4d44] rounded-2xl px-4 py-2 text-lg w-fit shadow-sm max-w-[90%] mb-3 ml-2';
      div.innerHTML = inner;
      // Guardar el texto original (con URLs completas) para copiar/compartir
      if (sender === 'bot') {
        div.setAttribute('data-msg-original', (originalText || text).replace(/<br>/g, '\n').replace(/<[^>]+>/g, ''));
        // Guardar la pregunta asociada a esta respuesta
        if (window.lastUserQuestion) {
          div.setAttribute('data-user-question', window.lastUserQuestion);
        }
      }
      chatContainer.appendChild(div);
      setTimeout(() => {
        div.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 100);
      updatePlaceholder();
    
      // Iconos copiar, compartir y feedback solo para bot
      if (sender === 'bot') {
        setTimeout(() => {
          const copyBtn = div.querySelector('.copy-btn');
          const shareBtn = div.querySelector('.share-btn');
          const thumbsUpBtn = div.querySelector('.thumbs-up-btn');
          const thumbsDownBtn = div.querySelector('.thumbs-down-btn');
          // Usar el texto original guardado en el atributo
          const msgText = div.getAttribute('data-msg-original') || div.querySelector('.msg-text').innerText;
          const userQuestion = div.getAttribute('data-user-question') || '';
          function showTooltip(btn, msg) {
            let tip = document.createElement('div');
            tip.className = 'msg-tooltip';
            tip.textContent = msg;
            tip.style.position = 'absolute';
            tip.style.background = '#228b54';
            tip.style.color = '#fff';
            tip.style.padding = '2px 8px';
            tip.style.borderRadius = '6px';
            tip.style.fontSize = '0.85em';
            tip.style.bottom = '36px';
            tip.style.left = '0px';
            tip.style.zIndex = 10;
            tip.style.pointerEvents = 'none';
            btn.parentElement.appendChild(tip);
            setTimeout(() => tip.remove(), 1200);
          }
          function handleCopy(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!navigator.clipboard) {
              showTooltip(copyBtn, 'Solo disponible en HTTPS');
              return;
            }
            const msgTextWithFooter = msgText + '\n\nGenerado por Guía VallaBus\nhttps://guia.vallabus.com';
            navigator.clipboard.writeText(msgTextWithFooter).then(() => {
              showTooltip(copyBtn, '¡Copiado!');
            });
          }
          function handleShare(e) {
            e.preventDefault();
            e.stopPropagation();
            const msgTextWithFooter = msgText + '\n\nGenerado por Guía VallaBus\nhttps://guia.vallabus.com';
            if (navigator.share) {
              navigator.share({ text: msgTextWithFooter });
            } else if (navigator.clipboard) {
              navigator.clipboard.writeText(msgTextWithFooter).then(() => {
                showTooltip(shareBtn, '¡Copiado para compartir!');
              });
            } else {
              showTooltip(shareBtn, 'Solo disponible en HTTPS');
            }
          }
          if (copyBtn) copyBtn.addEventListener('click', handleCopy);
          if (shareBtn) shareBtn.addEventListener('click', handleShare);
          div.style.position = 'relative';
          // --- FEEDBACK LOGIC ---
          // Webhook URL
          const FEEDBACK_URL = 'https://tasks.nukeador.com/webhook/vallabus-guia-feedback';
          // Manita arriba
          if (thumbsUpBtn) thumbsUpBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            thumbsUpBtn.disabled = true;
            thumbsDownBtn.disabled = true;
            thumbsUpBtn.style.opacity = '1';
            thumbsUpBtn.querySelector('i').classList.remove('fa-regular');
            thumbsUpBtn.querySelector('i').classList.add('fa-solid');
            showTooltip(thumbsUpBtn, '¡Gracias por tu feedback!');
            // Enviar feedback positivo
            let headers = { 'Content-Type': 'application/json' };
            if (window.getAccessToken) {
              const token = await window.getAccessToken();
              if (token) headers['Authorization'] = `Bearer ${token}`;
            }
            fetch(FEEDBACK_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                feedback: 'positivo',
                respuesta: msgText,
                pregunta: userQuestion
              })
            });
          });
          if (thumbsDownBtn) thumbsDownBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // Solo marcar como "seleccionado" si realmente se envía feedback
            // Mostrar modal feedback negativo
            showNegativeFeedbackModal({respuesta: msgText, pregunta: userQuestion, thumbsDownBtn, thumbsUpBtn});
          });
          // Modal feedback negativo
          function showNegativeFeedbackModal({respuesta, pregunta, thumbsDownBtn, thumbsUpBtn}) {
            // Si ya existe, no crear otro
            if (document.getElementById('feedbackModal')) return;
            const modal = document.createElement('div');
            modal.id = 'feedbackModal';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100vw';
            modal.style.height = '100vh';
            modal.style.background = 'rgba(0,0,0,0.35)';
            modal.style.zIndex = '9999';
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
            // Detectar modo dark
            const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const bgColor = isDark ? '#23382b' : '#fff';
            const textColor = isDark ? '#b7e4c7' : '#222c24';
            const inputBg = isDark ? '#355347' : '#fff';
            const inputColor = isDark ? '#b7e4c7' : '#222c24';
            const inputBorder = isDark ? '1px solid #355347' : '1px solid #d1f2e0';
            modal.innerHTML = `
              <form id="feedbackForm" style="background:${bgColor};color:${textColor};padding:28px 22px 18px 22px;border-radius:18px;min-width:320px;max-width:90vw;box-shadow:0 4px 32px #0003;display:flex;flex-direction:column;gap:8px;">
                <label style="font-size:1.1em;font-weight:600;">Proporcionar información</label>
                <textarea name="comentario" rows="3" placeholder="¿Qué problema hubo con la respuesta? ¿Cómo se podría mejorar?" style="border-radius:8px;padding:8px 10px;font-size:1em;resize:vertical;border:${inputBorder};outline:none;background:${inputBg};color:${inputColor};transition:border 0.2s;"></textarea>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px;">
                  <label style="display:flex;align-items:center;gap:8px;font-size:1em;"><input type="checkbox" name="motivos" value="dañino" style="accent-color:#228b54;"> Esto es dañino/peligroso</label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:1em;"><input type="checkbox" name="motivos" value="no_es_verdad" style="accent-color:#228b54;"> Esto no es verdad</label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:1em;"><input type="checkbox" name="motivos" value="no_es_util" style="accent-color:#228b54;"> Esto no es útil</label>
                </div>
                <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:8px;">
                  <button type="button" id="cancelFeedbackBtn" style="background:none;border:none;color:#b7e4c7;font-size:1em;cursor:pointer;padding:6px 12px;">Cancelar</button>
                  <button type="submit" style="background:#228b54;color:#fff;border:none;border-radius:8px;padding:6px 18px;font-size:1em;cursor:pointer;">Enviar</button>
                </div>
              </form>
            `;
            document.body.appendChild(modal);
            // Cancelar
            document.getElementById('cancelFeedbackBtn').onclick = () => {
              modal.remove();
              // Restaurar estado de los botones
              thumbsDownBtn.disabled = false;
              thumbsUpBtn.disabled = false;
              thumbsDownBtn.style.opacity = '0.55';
              thumbsDownBtn.querySelector('i').classList.remove('fa-solid');
              thumbsDownBtn.querySelector('i').classList.add('fa-regular');
            };
            // Enviar
            document.getElementById('feedbackForm').onsubmit = async function(ev) {
              ev.preventDefault();
              const form = ev.target;
              const comentario = form.comentario.value.trim();
              const motivos = Array.from(form.querySelectorAll('input[name="motivos"]:checked')).map(cb => cb.value);
              // Enviar feedback negativo
              let headers = { 'Content-Type': 'application/json' };
              if (window.getAccessToken) {
                const token = await window.getAccessToken();
                if (token) headers['Authorization'] = `Bearer ${token}`;
              }
              fetch(FEEDBACK_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  feedback: 'negativo',
                  motivos,
                  comentario,
                  respuesta,
                  pregunta
                })
              });
              modal.remove();
              thumbsDownBtn.disabled = true;
              thumbsUpBtn.disabled = true;
              thumbsDownBtn.style.opacity = '1';
              thumbsDownBtn.querySelector('i').classList.remove('fa-regular');
              thumbsDownBtn.querySelector('i').classList.add('fa-solid');
              showTooltip(thumbsDownBtn, '¡Gracias por tu feedback!');
            };
          }
        }, 0);
      }
      // Guardar la última pregunta enviada por el usuario
      if (sender === 'user') {
        window.lastUserQuestion = (originalText || text).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
      }
    }

    // Mostrar/ocultar placeholder según si hay mensajes
    function updatePlaceholder() {
      const chatContainer = document.getElementById('chatContainer');
      const placeholder = document.getElementById('placeholderVallaBus');
      // Si hay algún mensaje, ocultar placeholder
      const bubbles = chatContainer.querySelectorAll('.chat-bubble');
      if (bubbles.length > 0) {
        placeholder.style.display = 'none';
      } else {
        placeholder.style.display = 'block';
      }
    }
    // Función para actualizar la interfaz cuando el asistente está hablando
    function setSpeakingState(isSpeaking) {
      const info = document.getElementById('info');
      const loader = document.getElementById('loader');
      const stopBtn = document.getElementById('stopBtn');
      
      if (isSpeaking) {
        info.classList.add('hidden');
        loader.classList.add('hidden');
        stopBtn.classList.remove('hidden');
      } else {
        info.textContent = 'Pulsa para hablar';
        info.classList.remove('hidden');
        loader.classList.add('hidden');
        stopBtn.classList.add('hidden');
      }
    }

    // Modificar addMessage para actualizar el placeholder
    const originalAddMessage = addMessage;
    window.addMessage = function(text, sender) {
      originalAddMessage(text, sender);
      updatePlaceholder();
      // LECTURA AUTOMÁTICA TRAS TAP MIC (solo si altavoz activo y flag activado)
      if (speechSupported && speakerActive && sender === 'assistant' && esperaLecturaPorVoz) {
        esperaLecturaPorVoz = false;
        speakLongText(text);
      }
    };
    
    // Llamar al cargar
    updatePlaceholder();
    
    // Detener el audio cuando se presiona el botón de detener
    document.getElementById('stopBtn').addEventListener('click', () => {
      speakLongTextCancelado = true;
      window.speechSynthesis.cancel();
      setSpeakingState(false);
    });

    // --- Botón altavoz: activar/desactivar lectura en alto ---
    // Leer preferencia de altavoz de localStorage (por defecto true)
    let speakerActive = localStorage.getItem('speakerActive') === null ? true : localStorage.getItem('speakerActive') === 'true';
    function updateSpeakerBtn() {
      const icon = document.getElementById('speakerIcon');
      if (speakerActive) {
        speakerBtn.classList.add('bg-[#eaf7ef]', 'text-[#434f48]', 'border-2', 'border-[#698374]', 'dark:bg-[#355347]', 'dark:text-[#b7e4c7]', 'dark:border-[#23382b]');
        speakerBtn.classList.remove('bg-[#b7e4c7]', 'text-[#228b54]', 'dark:bg-[#23382b]', 'dark:text-[#7be495]');
        icon.className = 'fa-solid fa-volume-up';
      } else {
        speakerBtn.classList.remove('bg-[#eaf7ef]', 'text-[#434f48]', 'dark:bg-[#355347]', 'dark:text-[#b7e4c7]');
        speakerBtn.classList.add('bg-[#b7e4c7]', 'text-[#228b54]', 'dark:bg-[#23382b]', 'dark:text-[#7be495]');
        icon.className = 'fa-solid fa-volume-xmark';
      }
    }
    speakerBtn.addEventListener('click', function(e) {
      e.preventDefault();
      speakerActive = !speakerActive;
      // Guardar preferencia en localStorage
      localStorage.setItem('speakerActive', speakerActive);
      updateSpeakerBtn();
      if (!speakerActive) {
        speakLongTextCancelado = true;
        window.speechSynthesis.cancel();
        setSpeakingState(false);
      }
    });
    updateSpeakerBtn();
    // Si quieres usar speakerActive para controlar la lectura, úsalo en speakLongText()

    // --- Placeholder animado de "Pensando..." ---
    function showThinkingPlaceholder() {
      let existing = document.getElementById('thinkingPlaceholder');
      if (!existing) {
        const chatContainer = document.getElementById('chatContainer');
        const div = document.createElement('div');
        div.id = 'thinkingPlaceholder';
        // Usar colores que aseguren contraste: verde oscuro en claro, verde claro en dark
        div.className = 'thinking-placeholder';
        div.innerHTML = '<span class="thinking-animated text-[#444] dark:text-[#eaf7ef]">Pensando</span>';
        chatContainer.appendChild(div);
        setTimeout(() => {
          div.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
      }
    }
    function removeThinkingPlaceholder() {
      const existing = document.getElementById('thinkingPlaceholder');
      if (existing) existing.remove();
    }

    // Utilidad para crear el mensaje de error con botón de reinicio
    function getErrorWithRestartButton() {
      // NO ocultar los controles aquí, solo devolver el mensaje
      getErrorWithRestartButton.voice = 'Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.';
      return `Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.<br><button id="restartBtn" class="mt-3 px-4 py-2 bg-[#228b54] dark:bg-[#7be495] text-white dark:text-[#185d39] rounded-lg flex items-center gap-2 mx-auto" style="display:block;font-size:1rem;"><i class='fa-solid fa-rotate-right'></i> Reiniciar la conversación</button>`;
    }

    // Delegar el click del botón de reinicio
    // (como los mensajes se agregan dinámicamente)
    document.addEventListener('click', function(e) {
      if (e.target && e.target.id === 'restartBtn') {
        // Al reiniciar, mostrar de nuevo los controles
        const micBtn = document.getElementById('micBtn');
        const keyboardBtn = document.getElementById('keyboardBtn');
        const info = document.getElementById('info');
        if (micBtn) micBtn.style.display = '';
        if (keyboardBtn) keyboardBtn.style.display = '';
        if (info) info.style.display = '';
        location.reload();
      }
    });

    // --- Utilidad para procesar enlaces y limpiar saltos de línea ---
    function procesarRespuestaConEnlaces(respuesta, {paraVoz = false} = {}) {
      const urlRegex = /(https?:\/\/[\S]+)/g;
      const emojiRegex = /([\u203C-\u3299\uD83C-\uDBFF][\uDC00-\uDFFF]?)/g;
      // Limpia saltos de línea antes y después de enlaces a rutas.vallabus.com
      let texto = respuesta.replace(urlRegex, (url) => {
        try {
          const urlObj = new URL(url);
          if (urlObj.hostname === 'rutas.vallabus.com') {
            // Elimina \n justo antes y después del enlace
            texto = texto.replace(new RegExp(`\\n*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n*`, 'g'), url);
          }
        } catch {}
        return url;
      });
      if (paraVoz) {
        // Elimina emojis y reemplaza URLs por marcador
        return texto.replace(emojiRegex, '').replace(urlRegex, '___ENLACE___');
      } else {
        // Reemplaza enlaces por HTML, y \n por <br>
        return texto.replace(urlRegex, url => {
          try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'rutas.vallabus.com') {
              return `<a href="${url}" target="_blank" rel="noopener" class="block w-full text-center text-white font-medium bg-[#698374] dark:bg-[#355347] py-2 px-3 my-2 rounded-lg hover:bg-[#56635a] dark:hover:bg-[#23382b] transition-colors"><i class="fa-solid fa-route mr-2"></i>Ver ruta y alternativas</a>`;
            } else if (url.startsWith('https://vallabus.com/#/horarios/')) {
              return `<a href="${url}" target="_blank" rel="noopener" class="block w-full text-center text-white font-medium bg-[#698374] dark:bg-[#355347] py-2 px-3 my-2 rounded-lg hover:bg-[#56635a] dark:hover:bg-[#23382b] transition-colors"><i class="fa-solid fa-bus mr-2"></i>Info y horarios</a>`;
            } else if (url === 'https://vallabus.com/#/cercanas') {
              return `<a href="${url}" target="_blank" rel="noopener" class="block w-full text-center text-white font-medium bg-[#698374] dark:bg-[#355347] py-2 px-3 my-2 rounded-lg hover:bg-[#56635a] dark:hover:bg-[#23382b] transition-colors"><i class="fa-solid fa-bus mr-2"></i>Ver paradas cercanas</a>`;
            } else {
              return `<a href="${url}" target="_blank" rel="noopener" class="text-[#228b54] dark:text-[#7be495] underline">${urlObj.hostname}</a>`;
            }
          } catch {
            return url;
          }
        }).replace(/\n/g, '<br>');
      }
    }

    // --- Centraliza el procesamiento de la respuesta del bot ---
    function handleBotResponse(data, {originalPregunta = null, infoRef = null, textInputFormRef = null} = {}) {
      removeThinkingPlaceholder();
      document.getElementById('loader').style.display = 'none';
      esperandoRespuestaBot = false; // Permitir nuevos envíos
      
      // Verificar si el botón de login está visible
      const loginBtn = document.getElementById('main-login-btn');
      const isLoginVisible = loginBtn && loginBtn.style.display !== 'none';
      
      if (!isLoginVisible) {
        // Solo habilitar controles si el usuario está autenticado
        setControlesUsuarioActivos(true);
      } else {
        // Si hay botón de login visible, asegurarse que los controles permanezcan ocultos
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      
      if (!isLoginVisible) {
        // Solo habilitar controles si el usuario está autenticado
        setControlesUsuarioActivos(true);
      } else {
        // Si hay botón de login visible, asegurarse que los controles permanezcan ocultos
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      
      if (textInputFormRef && textInputFormRef.style.display === 'none' && infoRef) infoRef.style.display = '';
      let respuesta = data.output || getErrorWithRestartButton();
      let respuestaParaVoz, respuestaConEnlaces;
      if (respuesta === getErrorWithRestartButton()) {
        respuestaParaVoz = getErrorWithRestartButton.voice;
        respuestaConEnlaces = respuesta;
      } else {
        respuestaParaVoz = procesarRespuestaConEnlaces(respuesta, {paraVoz: true});
        respuestaConEnlaces = procesarRespuestaConEnlaces(respuesta);
      }
      addMessage(respuestaConEnlaces, 'bot', respuesta);
      respuestaPendiente = respuestaParaVoz;
      if (recognitionEnded && respuestaPendiente) {
        speakLongText(respuestaPendiente);
        respuestaPendiente = null;
      }
    }

    // --- FUNCIÓN REUTILIZABLE PARA INICIALIZAR MODALES DE MARKDOWN (legal, ayuda, etc) ---
    function inicializarModalMarkdown({
      linkIds = [], // IDs de los enlaces que abren el modal (pueden ser varios)
      modalId,
      contentId,
      closeBtnId,
      mdFile,
      title = '',
      acceptModalId = null // Si se debe volver al modal de aceptación si no se ha aceptado
    }) {
      const modal = document.getElementById(modalId);
      const contentDiv = document.getElementById(contentId);
      const closeBtn = document.getElementById(closeBtnId);
      const acceptModal = acceptModalId ? document.getElementById(acceptModalId) : null;
      if (!modal || !contentDiv || !closeBtn) return;
      modal.classList.add('hidden');
      modal.style.display = 'none';
      // Función para abrir el modal y cargar el markdown
      async function abrirModal() {
        contentDiv.innerHTML = '<span class="text-base">Cargando…</span>';
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        try {
          const resp = await fetch(mdFile);
          if (!resp.ok) throw new Error('Error al cargar el documento: ' + resp.status);
          const md = await resp.text();
          if (window.marked) {
            const markedOptions = { headerIds: true, headerPrefix: mdFile.replace(/\..*$/, '') + '-heading-' };
            contentDiv.innerHTML = window.marked.parse(md, markedOptions);
            // Añadir clases semánticas a headings y otros elementos
            const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
            headings.forEach(heading => {
              heading.classList.add('modal-md-heading', `modal-md-${heading.tagName.toLowerCase()}`);
            });
            const paragraphs = contentDiv.querySelectorAll('p');
            paragraphs.forEach(p => p.classList.add('modal-md-paragraph'));
            const lists = contentDiv.querySelectorAll('ul, ol');
            lists.forEach(list => list.classList.add('modal-md-list'));
            const links = contentDiv.querySelectorAll('a');
            links.forEach(link => link.classList.add('modal-md-link'));
            const preBlocks = contentDiv.querySelectorAll('pre');
            preBlocks.forEach(pre => pre.classList.add('modal-md-pre'));
            const codeBlocks = contentDiv.querySelectorAll('code');
            codeBlocks.forEach(code => code.classList.add('modal-md-code'));
            const blockquotes = contentDiv.querySelectorAll('blockquote');
            blockquotes.forEach(bq => bq.classList.add('modal-md-blockquote'));
          } else {
            contentDiv.innerHTML = '<pre>' + md + '</pre>';
          }
        } catch (err) {
          contentDiv.innerHTML = `<span class="text-red-600">No se pudo cargar el documento.</span>`;
        }
      }
      // Asignar listeners a todos los enlaces de apertura
      linkIds.forEach(id => {
        const link = document.getElementById(id);
        if (link) {
          link.addEventListener('click', function(e) {
            e.preventDefault();
            if (acceptModal) acceptModal.style.display = 'none';
            abrirModal();
          });
        }
      });
      // Cierre por botón
      closeBtn.addEventListener('click', function() {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        // Si no se ha aceptado la privacidad y hay acceptModal, volver a mostrarlo
        if (acceptModal && localStorage.getItem('privacyAccepted') !== 'true') {
          acceptModal.style.display = 'flex';
        }
      });
      // Cierre por click fuera del contenido
      modal.addEventListener('click', function(e) {
        if (e.target === modal) {
          modal.classList.add('hidden');
          modal.style.display = 'none';
          if (acceptModal && localStorage.getItem('privacyAccepted') !== 'true') {
            acceptModal.style.display = 'flex';
          }
        }
      });
    }

    // --- INICIALIZAR MODALES DE DOCUMENTOS LEGALES ---
    inicializarModalMarkdown({
      linkIds: ['privacyLink', 'openPrivacyModal'],
      modalId: 'privacyModal',
      contentId: 'privacyContent',
      closeBtnId: 'closePrivacyModal',
      mdFile: 'privacy.md',
      title: 'Política de privacidad',
      acceptModalId: 'privacyAcceptModal'
    });
    inicializarModalMarkdown({
      linkIds: ['termsLink', 'openTermsModal'],
      modalId: 'termsModal',
      contentId: 'termsContent',
      closeBtnId: 'closeTermsModal',
      mdFile: 'terminos.md',
      title: 'Términos de uso',
      acceptModalId: 'privacyAcceptModal'
    });

    // --- Lógica de modal de aceptación de privacidad (solo DRY, sin listeners antiguos) ---
    const acceptModal = document.getElementById('privacyAcceptModal');
    const acceptBtn = document.getElementById('acceptPrivacyBtn');
    let privacyModalShown = false;
    async function checkAndShowPrivacyModal() {
      let isAuthenticated = false;
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        isAuthenticated = await window.auth0Client.isAuthenticated();
      }
      if (acceptModal && isAuthenticated && localStorage.getItem('privacyAccepted') !== 'true' && !privacyModalShown) {
        acceptModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setTimeout(() => { if (acceptBtn) acceptBtn.focus(); }, 100);
        privacyModalShown = true;
      }
      // Si el usuario cierra sesión, permitir mostrar de nuevo si vuelve a loguear
      if (!isAuthenticated) {
        privacyModalShown = false;
      }
    }
    checkAndShowPrivacyModal();
    setInterval(checkAndShowPrivacyModal, 1000);
    if (acceptBtn) {
      acceptBtn.addEventListener('click', function() {
        localStorage.setItem('privacyAccepted', 'true');
        acceptModal.style.display = 'none';
        document.body.style.overflow = '';
      });
    }

    // --- Autogrow para textarea y contador de caracteres ---
    if (textInput && textInput.tagName === 'TEXTAREA') {
      const charCounter = document.getElementById('charCounter');
      const maxChars = 500;
      function updateCharCounter() {
        const remaining = maxChars - textInput.value.length;
        if (charCounter) charCounter.textContent = remaining;
      }
      textInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value.length > maxChars) {
          this.value = this.value.slice(0, maxChars);
        }
        updateCharCounter();
      });
      // Inicializar altura y contador
      textInput.style.height = 'auto';
      textInput.style.height = (textInput.scrollHeight) + 'px';
      updateCharCounter();
    }

    // Validar límite de caracteres al enviar
    textInputForm.addEventListener('submit', async function(e) {
      if (textInput && textInput.value.length > 500) {
        e.preventDefault();
        textInput.value = textInput.value.slice(0, 500);
        if (document.getElementById('charCounter')) {
          document.getElementById('charCounter').textContent = 0;
        }
        return;
      }
      e.preventDefault();
      if (esperandoRespuestaBot) return; // Bloquear si esperando respuesta
      setControlesUsuarioActivos(false); // Deshabilitar controles
      if (!await checkAuthAndRedirectIfNeeded()) {
        // No activar controles si no está autenticado, mostrar login en su lugar
        window.mostrarSoloLogin && window.mostrarSoloLogin();
        return;
      }
      const value = textInput.value.trim();
      if (!value) {
        setControlesUsuarioActivos(true);
        return;
      }
      esperandoRespuestaBot = true; // Bloquear nuevos envíos
      addMessage(value, 'user');
      textInput.value = '';
      if (speechSupported) {
        setTextMode(false);
      }
      // Ocultar "Pulsa para hablar" antes de mostrar loader
      const info = document.getElementById('info');
      if (info) info.style.display = 'none';
      document.getElementById('loader').style.display = 'flex';
      showThinkingPlaceholder();
      await enviarMensajeAlBot({
        texto: value,
        sessionId,
        infoRef: info,
        textInputFormRef: textInputForm
      });
    });

    // Registrar el service worker para PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js');
      });
    }

    // Sidebar logic
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('closeSidebarBtn');

    function openSidebar() {
      sidebar.classList.remove('translate-x-full');
      overlay.classList.remove('opacity-0', 'pointer-events-none');
      overlay.classList.add('opacity-100');
    }
    function closeSidebar() {
      sidebar.classList.add('translate-x-full');
      overlay.classList.add('opacity-0', 'pointer-events-none');
      overlay.classList.remove('opacity-100');
    }
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      openSidebar();
    });
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    // Cerrar con swipe (touch)
    let startX = null;
    sidebar.addEventListener('touchstart', e => {
      if (e.touches.length === 1) startX = e.touches[0].clientX;
    });
    sidebar.addEventListener('touchmove', e => {
      if (startX !== null) {
        const deltaX = e.touches[0].clientX - startX;
        if (deltaX < -60) closeSidebar();
      }
    });
    sidebar.addEventListener('touchend', () => { startX = null; });
    // Cerrar con Escape
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSidebar();
    });

    // Ocultar el botón de invitación si el usuario está logeado
    document.addEventListener('DOMContentLoaded', async function() {
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        const isAuthenticated = await window.auth0Client.isAuthenticated();
        const inviteBtn = document.getElementById('inviteBtn');
        if (inviteBtn) inviteBtn.style.display = isAuthenticated ? 'none' : '';
      } else {
        // Si auth0Client aún no está listo, esperar a que lo esté
        const checkAuth = setInterval(async () => {
          if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
            clearInterval(checkAuth);
            const isAuthenticated = await window.auth0Client.isAuthenticated();
            const inviteBtn = document.getElementById('inviteBtn');
            if (inviteBtn) inviteBtn.style.display = isAuthenticated ? 'none' : '';
          }
        }, 200);
      }
    });

    // Mostrar/ocultar placeholder e invitación solo cuando Auth0 esté listo
    window.addEventListener('DOMContentLoaded', function() {
      function showPlaceholderAndInvite(isAuthenticated) {
        var placeholder = document.getElementById('placeholderVallaBus');
        var inviteBtn = document.getElementById('inviteBtn');
        if (placeholder) placeholder.style.display = '';
        if (inviteBtn) inviteBtn.style.display = isAuthenticated ? 'none' : '';
      }
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        window.auth0Client.isAuthenticated().then(isAuthenticated => {
          showPlaceholderAndInvite(isAuthenticated);
        });
      } else {
        // Esperar a que auth0Client esté listo
        const checkAuth = setInterval(function() {
          if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
            clearInterval(checkAuth);
            window.auth0Client.isAuthenticated().then(isAuthenticated => {
              showPlaceholderAndInvite(isAuthenticated);
            });
          }
        }, 100);
      }
    });

    // Comprobación de autenticación al cargar la app (espera a que auth0Client esté listo y procesa el callback de Auth0 si es necesario)
    (function checkAuthOnLoadWaiter() {
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function' && typeof construirHeaders === 'function') {
        // Detectar si estamos en el callback de Auth0 (tras login)
        if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
          window.auth0Client.handleRedirectCallback().then(() => {
            window.history.replaceState({}, document.title, window.location.pathname);
            construirHeaders().then(headers => {
              if (!headers || !headers['Authorization']) {
                window.mostrarSoloLogin && window.mostrarSoloLogin();
              } else {
                // Eliminar el botón de login si existe
                const loginMainBtn = document.getElementById('main-login-btn');
                if (loginMainBtn) loginMainBtn.remove();
                // Mostrar controles de usuario y activarlos
                if (typeof setTextMode === 'function' && speechSupported) {
                  setTextMode(false); // Solo micrófono visible por defecto
                } else {
                  if (info) info.style.display = '';
                  if (textInputForm) textInputForm.style.display = '';
                }
                setControlesUsuarioActivos(true);
              }
            });
          }).catch(e => {
            // Silenciar error de estado inválido (puede ocurrir si el usuario refresca en el callback)
            window.history.replaceState({}, document.title, window.location.pathname);
            construirHeaders().then(headers => {
              if (!headers || !headers['Authorization']) {
                window.mostrarSoloLogin && window.mostrarSoloLogin();
              } else {
                // Eliminar el botón de login si existe
                const loginMainBtn = document.getElementById('main-login-btn');
                if (loginMainBtn) loginMainBtn.remove();
                // Mostrar controles de usuario y activarlos
                if (typeof setTextMode === 'function' && speechSupported) {
                  setTextMode(false); // Solo micrófono visible por defecto
                } else {
                  if (info) info.style.display = '';
                  if (textInputForm) textInputForm.style.display = '';
                }
                setControlesUsuarioActivos(true);
              }
            });
          });
        } else {
          construirHeaders().then(headers => {
            if (!headers || !headers['Authorization']) {
              window.mostrarSoloLogin && window.mostrarSoloLogin();
            } else {
              // Eliminar el botón de login si existe
              const loginMainBtn = document.getElementById('main-login-btn');
              if (loginMainBtn) loginMainBtn.remove();
              // Mostrar controles de usuario y activarlos
              if (typeof setTextMode === 'function' && speechSupported) {
                setTextMode(false); // Solo micrófono visible por defecto
              } else {
                if (info) info.style.display = '';
                if (textInputForm) textInputForm.style.display = '';
              }
              setControlesUsuarioActivos(true);
            }
          });
        }
      } else {
        setTimeout(checkAuthOnLoadWaiter, 50);
      }
    })();
  });
}