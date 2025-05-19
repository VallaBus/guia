document.addEventListener('DOMContentLoaded', function() {
    const micBtn = document.getElementById('micBtn');
    const micIcon = document.getElementById('micIcon');
    const info = document.getElementById('info');
    let voices = [];
    let recognizing = false;
    let recognition;
    let respuestaPendiente = null;
    let recognitionEnded = true;
    let utteranceActual = null; // Para evitar que el recolector de basura corte la voz
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
        info.textContent = 'Escuchando... Pulsa de nuevo para parar.';
      };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        info.textContent = '';
        document.getElementById('loader').style.display = 'flex';
        // Mostrar pregunta detectada
        addMessage(transcript, 'user');
        recognition.stop(); // Detener reconocimiento inmediatamente
        // Enviar al webhook
        // Codificar credenciales en base64 para Basic Auth
        const credentials = btoa(`${WEBHOOK_USER}:${WEBHOOK_PASS}`);
        fetch('https://tasks.nukeador.com/webhook/2d4dfc03-6c23-43ce-a419-c717c33799b5', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${credentials}`
          },
          body: JSON.stringify({ texto: transcript, usuario_id: usuarioId })
        })
          .then(res => res.json())
          .then(data => {
            document.getElementById('loader').style.display = 'none';
            let respuesta = data.output || 'Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.';
            // Reemplazar todas las URLs por un marcador especial para la voz
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            // Eliminar emojis para la voz (sin eliminar números)
            // Regex seguro para solo emojis (sin error de rango)
            const emojiRegex = /([\u203C-\u3299\uD83C-\uDBFF][\uDC00-\uDFFF]?)/g;
            let respuestaParaVoz = respuesta.replace(emojiRegex, '').replace(urlRegex, '___ENLACE___');
            // Para la vista, mostrar enlaces clicables con color verde acorde al theme
            const respuestaConEnlaces = respuesta.replace(urlRegex, url => {
              try {
                const urlObj = new URL(url);
                return `<a href="${url}" target="_blank" rel="noopener" class="text-[#228b54] dark:text-[#7be495] underline">${urlObj.hostname}</a>`;
              } catch {
                return url;
              }
            }).replace(/\n/g, '<br>');
            addMessage(respuestaConEnlaces, 'bot');
            respuestaPendiente = respuestaParaVoz;
            if (recognitionEnded && respuestaPendiente) {
              speakLongText(respuestaPendiente);
              respuestaPendiente = null;
            }
          })
          .catch(err => {
            document.getElementById('loader').style.display = 'none';
            info.textContent = 'Error al procesar la consulta.';
          });
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

    let speakLongTextCancelado = false; // GLOBAL

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
    const keyboardBtn = document.getElementById('keyboardBtn');
    const textInputForm = document.getElementById('textInputForm');
    const textInput = document.getElementById('textInput');

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
    // Enviar consulta por texto
    textInputForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const value = textInput.value.trim();
      if (!value) return;
      addMessage(value, 'user');
      setTextMode(false);
      // Ocultar "Pulsa para hablar" antes de mostrar loader
      const info = document.getElementById('info');
      if (info) info.style.display = 'none';
      document.getElementById('loader').style.display = 'flex';
      // Enviar al webhook igual que en reconocimiento de voz
      const credentials = btoa(`${WEBHOOK_USER}:${WEBHOOK_PASS}`);
      fetch('https://tasks.nukeador.com/webhook/2d4dfc03-6c23-43ce-a419-c717c33799b5', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify({ texto: value, usuario_id: usuarioId })
      })
        .then(res => res.json())
        .then(data => {
          document.getElementById('loader').style.display = 'none';
          // Mostrar de nuevo "Pulsa para hablar" solo si no estamos en modo texto
          if (textInputForm.style.display === 'none' && info) info.style.display = '';
          let respuesta = data.output || 'Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.';
          const urlRegex = /(https?:\/\/[^\s]+)/g;
          const emojiRegex = /([\u203C-\u3299\uD83C-\uDBFF][\uDC00-\uDFFF]?)/g;
          let respuestaParaVoz = respuesta.replace(emojiRegex, '').replace(urlRegex, '___ENLACE___');
          const respuestaConEnlaces = respuesta.replace(urlRegex, url => {
            try {
              const urlObj = new URL(url);
              return `<a href="${url}" target="_blank" rel="noopener" class="text-[#228b54] dark:text-[#7be495] underline">${urlObj.hostname}</a>`;
            } catch {
              return url;
            }
          }).replace(/\n/g, '<br>');
          addMessage(respuestaConEnlaces, 'bot');
          respuestaPendiente = respuestaParaVoz;
          if (recognitionEnded && respuestaPendiente) {
            speakLongText(respuestaPendiente);
            respuestaPendiente = null;
          }
        })
        .catch(() => {
          document.getElementById('loader').style.display = 'none';
          if (textInputForm.style.display === 'none' && info) info.style.display = '';
          addMessage('Lo siento, en estos momentos no puedo ayudarte, prueba de nuevo en un rato.', 'bot');
        });
    });

    // Mostrar solo uno de los botones según modo al cargar
    setTextMode(false);

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
    function addMessage(text, sender) {
      const chatContainer = document.getElementById('chatContainer');
      const div = document.createElement('div');
      div.className = sender === 'user'
        ? 'chat-bubble user-bubble bg-[#c0d6c5] dark:bg-[#23382b] text-[#1e4636] dark:text-[#eaf7ef] border border-[#d1f2e0] dark:border-[#3a4d44] rounded-2xl px-4 py-2 text-base w-fit self-end shadow-sm max-w-[90%] mb-3 mr-2'
        : 'chat-bubble bg-[#f8fef9] dark:bg-[#2e4d3a] text-[#185d39] dark:text-[#b7e4c7] border border-[#d1f2e0] dark:border-[#3a4d44] rounded-2xl px-4 py-2 text-xl w-fit shadow-sm max-w-[90%] mb-3 ml-2';
      div.innerHTML = text;
      chatContainer.appendChild(div);
      
      // Asegurar que el scroll muestre el último mensaje
      requestAnimationFrame(() => {
        chatContainer.scrollTo({
          top: chatContainer.scrollHeight,
          behavior: 'smooth'
        });
      });
      
      // Actualizar el placeholder (si existe)
      updatePlaceholder();
      updatePlaceholder();
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
    const speakerBtn = document.getElementById('speakerBtn');
    let speakerActive = true;
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
      updateSpeakerBtn();
      if (!speakerActive) {
        speakLongTextCancelado = true;
        window.speechSynthesis.cancel();
        setSpeakingState(false);
      }
    });
    updateSpeakerBtn();
    // Si quieres usar speakerActive para controlar la lectura, úsalo en speakLongText()
  });