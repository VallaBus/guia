// js/ubicacion.js
// Lógica de obtención de ubicación del usuario autenticado

let userLocation = null;
let ubicacionYaPedida = false;

function solicitarUbicacionSiLogeado() {
  if (!navigator.geolocation || !window.auth0Client || typeof window.auth0Client.isAuthenticated !== 'function') return;
  window.auth0Client.isAuthenticated().then(isAuthenticated => {
    if (!isAuthenticated) return;
    if (ubicacionYaPedida) return; // Solo una vez por sesión
    ubicacionYaPedida = true;
    // Opciones para obtener la mejor ubicación posible en móvil
    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    };

    const handleSuccess = (pos) => {
      userLocation = {
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude
      };
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(permission => {
        if (permission.state === 'granted' || permission.state === 'prompt') {
          navigator.geolocation.getCurrentPosition(handleSuccess, undefined, geoOptions);
        }
      }).catch(() => {
        navigator.geolocation.getCurrentPosition(handleSuccess, undefined, geoOptions);
      });
    } else {
      navigator.geolocation.getCurrentPosition(handleSuccess, undefined, geoOptions);
    }
  });
}

function iniciarWatcherUbicacion() {
  // Watcher para detectar login dinámico y pedir ubicación solo una vez
  setInterval(() => {
    if (window.auth0Client && typeof window.auth0Client.isAuthenticated === 'function') {
      window.auth0Client.isAuthenticated().then(isAuthenticated => {
        if (isAuthenticated && !ubicacionYaPedida) {
          // Pedir ubicación lo antes posible tras login
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

async function updateAndGetLocationAsync(timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve(userLocation);
    }

    const obtenerPosicionActual = () => {
      const geoOptions = {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0 // Forzar lectura fresh
      };

      let resolved = false;
      const fallbackTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(userLocation); // Fallback a la última conocida
        }
      }, timeoutMs + 200);

      navigator.geolocation.getCurrentPosition(
        pos => {
          if (resolved) return;
          resolved = true;
          clearTimeout(fallbackTimer);
          userLocation = {
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude
          };
          resolve(userLocation);
        },
        err => {
          if (resolved) return;
          resolved = true;
          clearTimeout(fallbackTimer);
          resolve(userLocation); // Fallback si falla
        },
        geoOptions
      );
    };

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(permission => {
        if (permission.state === 'granted') {
          obtenerPosicionActual();
        } else {
          // Si no está concedido explícitamente, devolvemos la última guardada o null
          resolve(userLocation);
        }
      }).catch(() => {
        // En navegadores como Safari iOS que no soportan permission.query
        obtenerPosicionActual();
      });
    } else {
      obtenerPosicionActual();
    }
  });
}

// Exportar funciones y variable
window.ubicacion = {
  iniciarWatcherUbicacion,
  getUserLocation: () => userLocation,
  updateAndGetLocationAsync
};
