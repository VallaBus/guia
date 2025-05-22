let auth0Client = null;
const fetchAuthConfig = () => fetch("/auth_config.json");

const configureClient = async () => {
  const response = await fetchAuthConfig();
  const config = await response.json();

  auth0Client = await auth0.createAuth0Client({
    domain: config.domain,
    clientId: config.clientId,
    authorizationParams: {
      audience: config.audience,
      redirect_uri: window.location.origin
    },
    useRefreshTokens: true,
    cacheLocation: 'localstorage'
  });

  // Expón auth0Client en window para acceso global
  window.auth0Client = auth0Client;
};

window.onload = async () => {
  await configureClient();

  // Refresca el token silenciosamente al cargar para mantener sesión si hay SSO
  // Si el usuario tiene sesión SSO activa en Auth0, esto renovará el token y lo mantendrá logeado aunque hayan pasado días.
  // Si no tiene sesión SSO, simplemente no hará nada y el usuario seguirá como anónimo.
  try {
    await getAccessToken(); // Esto renovará el token si la sesión SSO sigue activa
  } catch (e) {}

  // Espera a que Auth0 esté listo y detecta correctamente la sesión
  let isAuthenticated = false;
  try {
    isAuthenticated = await auth0Client.isAuthenticated();
  } catch (e) {
    isAuthenticated = false;
  }

  // Procesa el callback de Auth0 si es necesario
  const query = window.location.search;
  if (query.includes("code=") && query.includes("state=")) {
    try {
      await auth0Client.handleRedirectCallback();
    } catch (e) {}
    // Vuelve a comprobar autenticación tras el callback
    isAuthenticated = await auth0Client.isAuthenticated();
    window.history.replaceState({}, document.title, "/");
  }

  // Oculta o muestra controles de la barra inferior según autenticación
  const info = document.getElementById('info');
  const textInputForm = document.getElementById('textInputForm');
  const loader = document.getElementById('loader');
  const stopBtn = document.getElementById('stopBtn');
  const speakerBtn = document.getElementById('speakerBtn');
  const micBtn = document.getElementById('micBtn');
  const keyboardBtn = document.getElementById('keyboardBtn');
  let loginMainBtn = document.getElementById('main-login-btn');
  if (!isAuthenticated) {
    // Oculta todos los controles de la barra inferior
    if (info) info.style.display = 'none';
    if (textInputForm) textInputForm.style.display = 'none';
    if (loader) loader.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (speakerBtn) speakerBtn.style.display = 'none';
    if (micBtn) micBtn.style.display = 'none';
    if (keyboardBtn) keyboardBtn.style.display = 'none';
    if (!loginMainBtn) {
      loginMainBtn = document.createElement('button');
      loginMainBtn.id = 'main-login-btn';
      loginMainBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Iniciar sesión';
      loginMainBtn.className = 'login-main-btn';
      loginMainBtn.onclick = login;
      const bottomBar = document.querySelector('.fixed-bottom-bar');
      if (bottomBar) bottomBar.appendChild(loginMainBtn);
    } else {
      loginMainBtn.style.display = 'block';
    }
    // Mostrar el enlace de invitación si existe
    const inviteBtn = document.getElementById('inviteBtn');
    if (inviteBtn) inviteBtn.style.display = '';
  } else {
    // Solo ocultar el botón de login, pero NO forzar display de los demás (deja que main.js controle)
    if (loginMainBtn) loginMainBtn.style.display = 'none';
    // Ocultar el enlace de invitación si existe
    const inviteBtn = document.getElementById('inviteBtn');
    if (inviteBtn) inviteBtn.style.display = 'none';
  }

  // Asigna listeners a los botones de login y logout SOLO si existen
  const btnLogin = document.getElementById("btn-login");
  if (btnLogin) btnLogin.addEventListener("click", login);
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", logout);

  // NEW - update the UI state
  updateUI();
};

const updateUI = async () => { 
  const isAuthenticated = await auth0Client.isAuthenticated();

  // Solo modificar si existen los botones
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.disabled = !isAuthenticated;
  if (btnLogin) btnLogin.disabled = isAuthenticated;

  // Mostrar/ocultar botones según autenticación
  if (btnLogin) btnLogin.style.display = isAuthenticated ? "none" : "block";
  if (btnLogout) btnLogout.style.display = "none";

  // Mostrar info de usuario en el sidebar
  const userInfoDiv = document.getElementById("userInfo");
  const gatedContent = document.getElementById("gated-content");
  if (isAuthenticated) {
    // Ocultar contenido de metadatos y tokens si existe
    if (gatedContent) gatedContent.classList.add("hidden");
    // Mostrar avatar con iniciales y nombre de usuario
    const user = await auth0Client.getUser();
    userInfoDiv.style.display = "flex";
    userInfoDiv.style.alignItems = "center";
    userInfoDiv.style.position = "relative";
    userInfoDiv.innerHTML = "";
    // Avatar con iniciales
    let initials = "?";
    let username = "Usuario";
    if (user && user.email) {
      const namePart = user.email.split("@")[0];
      username = namePart;
      initials = namePart.split(/[^a-zA-Z0-9]/).filter(Boolean).map(s => s[0].toUpperCase()).join('').slice(0,2) || namePart[0].toUpperCase();
    } else if (user && user.name) {
      const namePart = user.name.split(" ");
      initials = namePart.map(s => s[0].toUpperCase()).join('').slice(0,2);
      username = user.name;
    }
    const avatar = document.createElement('div');
    avatar.style.width = '38px';
    avatar.style.height = '38px';
    avatar.style.borderRadius = '50%';
    avatar.style.background = '#228b54';
    avatar.style.color = '#fff';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.fontWeight = 'bold';
    avatar.style.fontSize = '1.2em';
    avatar.style.marginRight = '12px';
    avatar.textContent = initials;
    // Contenedor clickable para desplegable
    const userDropdown = document.createElement('div');
    userDropdown.style.display = 'flex';
    userDropdown.style.alignItems = 'center';
    userDropdown.style.cursor = 'pointer';
    userDropdown.style.width = '100%';
    userDropdown.tabIndex = 0;
    // Nombre
    const nameSpan = document.createElement('span');
    nameSpan.textContent = username;
    nameSpan.style.fontWeight = 'bold';
    nameSpan.style.fontSize = '1.1em';
    nameSpan.style.color = '#fff';
    nameSpan.style.marginRight = '8px';
    userDropdown.appendChild(avatar);
    userDropdown.appendChild(nameSpan);
    // Icono flecha
    const arrow = document.createElement('i');
    arrow.className = 'fa-solid fa-chevron-down';
    arrow.style.fontSize = '0.9em';
    arrow.style.color = '#b7e4c7';
    userDropdown.appendChild(arrow);
    userInfoDiv.appendChild(userDropdown);
    // Desplegable
    let dropdownMenu = document.getElementById('userDropdownMenu');
    if (dropdownMenu) dropdownMenu.remove();
    dropdownMenu = document.createElement('div');
    dropdownMenu.id = 'userDropdownMenu';
    dropdownMenu.style.position = 'absolute';
    dropdownMenu.style.top = '48px';
    dropdownMenu.style.left = '0';
    dropdownMenu.style.background = '#355347';
    dropdownMenu.style.color = '#fff';
    dropdownMenu.style.borderRadius = '10px';
    dropdownMenu.style.boxShadow = '0 2px 12px #0003';
    dropdownMenu.style.padding = '8px 0';
    dropdownMenu.style.minWidth = '160px';
    dropdownMenu.style.display = 'none';
    dropdownMenu.style.zIndex = '999';
    // Botón cerrar sesión
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Cerrar sesión';
    logoutBtn.className = 'w-full text-left px-4 py-2 hover:bg-[#228b54] hover:text-white bg-transparent border-none cursor-pointer';
    logoutBtn.style.background = 'none';
    logoutBtn.style.border = 'none';
    logoutBtn.style.width = '100%';
    logoutBtn.style.textAlign = 'left';
    logoutBtn.style.color = '#fff';
    logoutBtn.style.fontSize = '1em';
    logoutBtn.onclick = logout;
    dropdownMenu.appendChild(logoutBtn);
    userInfoDiv.appendChild(dropdownMenu);
    // Mostrar/ocultar desplegable
    let open = false;
    userDropdown.onclick = function(e) {
      e.stopPropagation();
      open = !open;
      dropdownMenu.style.display = open ? 'block' : 'none';
      arrow.className = open ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
    };
    // Cerrar al hacer click fuera
    document.addEventListener('click', function hideDropdown(e) {
      if (!userInfoDiv.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        arrow.className = 'fa-solid fa-chevron-down';
        open = false;
      }
    });
  } else {
    if (gatedContent) gatedContent.classList.add("hidden");
    userInfoDiv.style.display = "none";
    userInfoDiv.textContent = "";
  }
};

// Helper para obtener el access token actualizado antes de cada petición
// Usa getTokenSilently() para renovar el token si es posible, pero NO fuerza login automático si falla.
// Así, solo se fuerza login cuando el usuario lo solicita explícitamente.
const getAccessToken = async () => {
  try {
    return await auth0Client.getTokenSilently();
  } catch (e) {
    // Si falla, probablemente la sesión expiró o no hay login, pero NO forzar login automáticamente
    return null;
  }
};

// Expón getAccessToken en window para acceso global desde main.js
window.getAccessToken = getAccessToken;

// Ejemplo de uso para peticiones autenticadas:
// async function fetchConToken(url, options = {}) {
//   const token = await getAccessToken();
//   if (!token) throw new Error('No se pudo obtener el token');
//   return fetch(url, {
//     ...options,
//     headers: {
//       ...(options.headers || {}),
//       Authorization: `Bearer ${token}`
//     }
//   });
// }

const login = async () => {
  await auth0Client.loginWithRedirect({
    authorizationParams: {
      redirect_uri: window.location.origin
    }
  });
};

const logout = () => {
  auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin
    }
  });
};