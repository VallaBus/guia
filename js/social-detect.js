// --- Detección de navegador interno de apps sociales (Instagram, Facebook, TikTok, Twitter, LinkedIn, etc) ---
function isSocialAppWebView() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  // Añadir más patrones según sea necesario
  return /Instagram|FBAN|FBAV|FB_IAB|FBAN|FBAV|FB_IAB|FBSS|FBCA|FBCR|FBSV|FBID|FBMD|FBSN|FBOP|FBRV|TikTok|Twitter|LinkedIn|Snapchat|Pinterest|Line|WeChat|WhatsApp|Messenger/i.test(ua);
}

window.isSocialAppWebView = isSocialAppWebView;

// --- Lógica de UI para navegadores internos de apps sociales ---
window.handleSocialAppWebViewUI = function handleSocialAppWebViewUI() {
  if (!window.isSocialAppWebView || !window.isSocialAppWebView()) return;
  console.log('[VallaBus] Navegador interno de app social detectado:', navigator.userAgent);
  document.addEventListener('DOMContentLoaded', function() {
    var placeholder = document.getElementById('placeholderVallaBus');
    var inviteBtn = document.getElementById('inviteBtn');
    if (placeholder) {
      placeholder.style.display = '';
      const originalBtns = Array.from(placeholder.querySelectorAll('a, button')).map(el => el.outerHTML).join(' ');
      placeholder.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Para poder usar esta webapp correctamente debes abrirla desde el navegador de tu dispositivo (Chrome, Safari, etc). El navegador interno de apps no es compatible.<br><br>' + originalBtns;
      placeholder.className = 'text-base text-[#890000] dark:text-[#fca5a5] font-semibold text-center px-4 py-4';
    }
    if (inviteBtn) inviteBtn.style.display = '';
    var micBtn = document.getElementById('micBtn');
    var keyboardBtn = document.getElementById('keyboardBtn');
    var textInputForm = document.getElementById('textInputForm');
    var speakerBtn = document.getElementById('speakerBtn');
    var info = document.getElementById('info');
    var bottomBar = document.querySelector('.fixed-bottom-bar');
    if (micBtn) micBtn.style.display = 'none';
    if (keyboardBtn) keyboardBtn.style.display = 'none';
    if (textInputForm) textInputForm.style.display = 'none';
    if (speakerBtn) speakerBtn.style.display = 'none';
    if (info) info.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';
  });
  // NO lanzar error ni detener la inicialización, solo mostrar el mensaje y ocultar controles
};
