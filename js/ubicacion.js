// js/ubicacion.js
// Lógica de obtención de ubicación del usuario autenticado

let userLocation = null;
let ubicacionYaPedida = false;
let wasAuthenticated = false;

function solicitarUbicacionSiLogeado() {
  if (!navigator.geolocation || !window.auth0Client || typeof window.auth0Client.isAuthenticated !== 'function') return;
  window.auth0Client.isAuthenticated().then(isAuthenticated => {
    if (!isAuthenticated) return;
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(permission => {
        if (permission.state === 'granted' || permission.state === 'prompt') {
          navigator.geolocation.getCurrentPosition(pos => {
            userLocation = {
              latitud: pos.coords.latitude,
              longitud: pos.coords.longitude
            };
          });
        }
      });
    } else {
      navigator.geolocation.getCurrentPosition(pos => {
        userLocation = {
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude
        };
      });
    }
  });
}

function setupAuth0LocationWatcher() {
  if (!window.auth0Client || typeof window.auth0Client.isAuthenticated !== 'function') return;
  window.auth0Client.isAuthenticated().then(isAuthenticated => {
    if (isAuthenticated && !wasAuthenticated) {
      solicitarUbicacionSiLogeado();
    }
    wasAuthenticated = isAuthenticated;
  });
}

function iniciarWatcherUbicacion() {
  if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
    solicitarUbicacionSiLogeado();
    setInterval(setupAuth0LocationWatcher, 1000);
  } else {
    const checkAuth = setInterval(function() {
      if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
        clearInterval(checkAuth);
        solicitarUbicacionSiLogeado();
        setInterval(setupAuth0LocationWatcher, 1000);
      }
    }, 100);
  }
  // Watcher para detectar login dinámico y pedir ubicación solo una vez
  setInterval(() => {
    if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
      window.auth0Client.isAuthenticated().then(isAuthenticated => {
        if (isAuthenticated && !ubicacionYaPedida) {
          solicitarUbicacionSiLogeado();
          ubicacionYaPedida = true;
        }
        if (!isAuthenticated) {
          ubicacionYaPedida = false;
        }
      });
    }
  }, 1000);
}

// Exportar funciones y variable
window.ubicacion = {
  iniciarWatcherUbicacion,
  getUserLocation: () => userLocation
};
