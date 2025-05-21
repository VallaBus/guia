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

  // Generar o recuperar un id único de usuario
  function getUserId() {
    let id = localStorage.getItem('usuario_id');
    if (!id) {
      if (window.crypto && window.crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        // Fallback simple
        id = 'u-' + Math.random().toString(36).slice(2) + Date.now();
      }
      localStorage.setItem('usuario_id', id);
    }
    return id;
  }
  const usuarioId = getUserId();
  // Cargar voces
  function loadVoices() {
    voices = window.speechSynthesis.getVoices();
  }
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
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
      addMessage(transcript, 'user');
      recognition.stop(); // Detener reconocimiento inmediatamente
      // Enviar al webhook
      showThinkingPlaceholder();
      (async () => {
        let headers = { 'Content-Type': 'application/json' };
        if (window.auth0Client && await window.auth0Client.isAuthenticated()) {
          const token = await window.auth0Client.getTokenSilently();
          headers['Authorization'] = `Bearer ${token}`;
        }
        try {
          const res = await fetch('https://tasks.nukeador.com/webhook/vallabus-guia', {
            method: 'POST',
            headers,
            body: JSON.stringify({ texto: transcript, usuario_id: usuarioId })
          });
          const data = await res.json();
          removeThinkingPlaceholder();
          document.getElementById('loader').style.display = 'none';
          let respuesta = data.output || getErrorWithRestartButton();
          // Reemplazar todas las URLs por un marcador especial para la voz
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          // Eliminar emojis para la voz (sin eliminar números)
          // Regex seguro para solo emojis (sin error de rango)
          const emojiRegex = /([\u203C-\u3299\uD83C-\uDBFF][\uDC00-\uDFFF]?)/g;
          let respuestaParaVoz;
          if (respuesta === getErrorWithRestartButton()) {
            respuestaParaVoz = getErrorWithRestartButton.voice;
          } else {
            respuestaParaVoz = respuesta.replace(emojiRegex, '').replace(urlRegex, '___ENLACE___');
          }
          // Para la vista, mostrar enlaces clicables con color verde acorde al theme
          const respuestaConEnlaces = respuesta.replace(urlRegex, url => {
            try {
              const urlObj = new URL(url);
              return `<a href="${url}" target="_blank" rel="noopener" class="text-[#228b54] dark:text-[#7be495] underline">${urlObj.hostname}</a>`;
            } catch {
              return url;
            }
          }).replace(/\n/g, '<br>');
          addMessage(respuestaConEnlaces, 'bot', respuesta);
          respuestaPendiente = respuestaParaVoz;
          if (recognitionEnded && respuestaPendiente) {
            speakLongText(respuestaPendiente);
            respuestaPendiente = null;
          }
        } catch (err) {
          removeThinkingPlaceholder();
          document.getElementById('loader').style.display = 'none';
          info.textContent = 'Error al procesar la consulta.';
        }
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
      const vocesEs = voices.filter(voice => voice.lang.startsWith('es'));
      if (vocesEs.length > 0) utteranceActual.voice = vocesEs[0];
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

  // Enviar consulta por texto
  textInputForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const value = textInput.value.trim();
    if (!value) return;
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
    // Enviar al webhook: si logueado, Bearer; si no, solo Content-Type
    let headers = { 'Content-Type': 'application/json' };
    let body = JSON.stringify({ texto: value, usuario_id: usuarioId });
    if (window.auth0Client && await window.auth0Client.isAuthenticated()) {
      const token = await window.auth0Client.getTokenSilently();
      headers['Authorization'] = `Bearer ${token}`;
    }
    try {
      const res = await fetch('https://tasks.nukeador.com/webhook/vallabus-guia', {
        method: 'POST',
        headers,
        body
      });
      const data = await res.json();
      removeThinkingPlaceholder();
      document.getElementById('loader').style.display = 'none';
      if (textInputForm.style.display === 'none' && info) info.style.display = '';
      let respuesta = data.output || getErrorWithRestartButton();
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const emojiRegex = /([\u203C-\u3299\uD83C-\uDBFF][\uDC00-\uDFFF]?)/g;
      let respuestaParaVoz;
      if (respuesta === getErrorWithRestartButton()) {
        respuestaParaVoz = getErrorWithRestartButton.voice;
      } else {
        respuestaParaVoz = respuesta.replace(emojiRegex, '').replace(urlRegex, '___ENLACE___');
      }
      const respuestaConEnlaces = respuesta.replace(urlRegex, url => {
        try {
          const urlObj = new URL(url);
          return `<a href="${url}" target="_blank" rel="noopener" class="text-[#228b54] dark:text-[#7be495] underline">${urlObj.hostname}</a>`;
        } catch {
          return url;
        }
      }).replace(/\n/g, '<br>');
      addMessage(respuestaConEnlaces, 'bot', respuesta);
      respuestaPendiente = respuestaParaVoz;
      if (recognitionEnded && respuestaPendiente) {
        speakLongText(respuestaPendiente);
        respuestaPendiente = null;
      }
    } catch {
      removeThinkingPlaceholder();
      document.getElementById('loader').style.display = 'none';
      if (textInputForm.style.display === 'none' && info) info.style.display = '';
      const errorMsg = getErrorWithRestartButton();
      addMessage(errorMsg, 'bot', getErrorWithRestartButton.voice);
    }
  });

  // Mostrar solo uno de los botones según modo al cargar
  if (speechSupported) {
    setTextMode(false);
  }

  micBtn.addEventListener('click', () => {
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
  });

  // --- FIN: Lógica de tema eliminada ---

  // Reemplazar la lógica de mostrar mensajes en userBubble/chatBubble por agregar elementos al chatContainer
  function addMessage(text, sender, originalText) {
    const chatContainer = document.getElementById('chatContainer');
    const div = document.createElement('div');
    let inner = text;
    if (sender === 'bot') {
      // Iconos copiar y compartir abajo a la izquierda, con separación y más transparentes
      inner = `<div class="msg-bot-inner" style="position:relative;display:flex;flex-direction:column;align-items:flex-start;">
        <div class='msg-text' style='width:100%;'>${text}</div>
        <div class="msg-actions" style="display:flex;gap:14px;align-items:center;margin-top:10px;margin-left:2px;">
          <button class="copy-btn" title="Copiar" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1em;color:#228b54;opacity:0.55;touch-action:manipulation;" tabindex="0" type="button">
            <i class="fa-regular fa-copy"></i>
          </button>
          <button class="share-btn" title="Compartir" style="background:none;border:none;cursor:pointer;padding:2px 4px;font-size:1em;color:#228b54;opacity:0.55;touch-action:manipulation;" tabindex="0" type="button">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
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
    }
    chatContainer.appendChild(div);
    setTimeout(() => {
      div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);
    updatePlaceholder();
  
    // Iconos copiar y compartir solo para bot
    if (sender === 'bot') {
      // Listeners para desktop y mobile (touch)
      setTimeout(() => {
        const copyBtn = div.querySelector('.copy-btn');
        const shareBtn = div.querySelector('.share-btn');
        // Usar el texto original guardado en el atributo
        const msgText = div.getAttribute('data-msg-original') || div.querySelector('.msg-text').innerText;
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
          navigator.clipboard.writeText(msgText).then(() => {
            showTooltip(copyBtn, '¡Copiado!');
          });
        }
        function handleShare(e) {
          e.preventDefault();
          e.stopPropagation();
          if (navigator.share) {
            navigator.share({ text: msgText });
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(msgText).then(() => {
              showTooltip(shareBtn, '¡Copiado para compartir!');
            });
          } else {
            showTooltip(shareBtn, 'Solo disponible en HTTPS');
          }
        }
        if (copyBtn) copyBtn.addEventListener('click', handleCopy);
        if (shareBtn) shareBtn.addEventListener('click', handleShare);
        div.style.position = 'relative';
      }, 0);
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
    // Oculta los botones de micro y teclado
    setTimeout(() => {
      const micBtn = document.getElementById('micBtn');
      const keyboardBtn = document.getElementById('keyboardBtn');
      if (micBtn) micBtn.style.display = 'none';
      if (keyboardBtn) keyboardBtn.style.display = 'none';
    }, 50);
    // Mensaje solo texto para voz
    getErrorWithRestartButton.voice = 'Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.';
    // Mensaje HTML para la vista
    return `Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.<br><button id="restartBtn" class="mt-3 px-4 py-2 bg-[#228b54] dark:bg-[#7be495] text-white dark:text-[#185d39] rounded-lg flex items-center gap-2 mx-auto" style="display:block;font-size:1rem;"><i class='fa-solid fa-rotate-right'></i> Reiniciar la conversación</button>`;
  }

  // Delegar el click del botón de reinicio
  // (como los mensajes se agregan dinámicamente)
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'restartBtn') {
      location.reload();
    }
  });
});