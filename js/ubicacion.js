// js/ubicacion.js
// Lógica de obtención de ubicación del usuario autenticado

let userLocation = null;
let ubicacionYaPedida = false;
let wasAuthenticated = false;

function solicitarUbicacionSiLogeado() {
  if (!navigator.geolocation || !window.auth0Client || typeof window.auth0Client.isAuthenticated !== 'function') return;
  window.auth0Client.isAuthenticated().then(isAuthenticated => {
    if (!isAuthenticated) return;
    if (ubicacionYaPedida) return; // Solo una vez por sesión
    ubicacionYaPedida = true;
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

function iniciarWatcherUbicacion() {
  // Watcher para detectar login dinámico y pedir ubicación solo una vez
  setInterval(() => {
    if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
      window.auth0Client.isAuthenticated().then(isAuthenticated => {
        if (isAuthenticated && !ubicacionYaPedida) {
          solicitarUbicacionSiLogeado();
        }
        if (!isAuthenticated) {
          ubicacionYaPedida = false;
          userLocation = null;
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
