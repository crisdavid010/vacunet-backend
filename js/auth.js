// Función para manejar el login
async function loginUser(email, password) {
    const errorMessageDiv = document.getElementById('errorMessage');
    if (errorMessageDiv) {
        errorMessageDiv.classList.add('d-none'); // Ocultar mensaje de error previo
        errorMessageDiv.textContent = '';
    }

    try {
        // Asegúrate que la URL base de la API esté correcta
        const response = await fetch(`${API_BASE_URL}/auth/login`, { // Usar API_BASE_URL global si está definida
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Error ${response.status}`);
        }

        if (data.token) {
            localStorage.setItem('userToken', data.token);
            if (data.user) { // Guardar info del usuario si el backend la envía
                localStorage.setItem('userInfo', JSON.stringify(data.user));
            }
            window.location.href = 'dashboard.html';
        } else {
            throw new Error('No se recibió token del servidor.');
        }
    } catch (error) {
        console.error('Error en loginUser:', error);
        if (errorMessageDiv) {
            errorMessageDiv.textContent = error.message || 'Error al intentar iniciar sesión.';
            errorMessageDiv.classList.remove('d-none');
        } else {
            alert(error.message || 'Error al intentar iniciar sesión.');
        }
    }
}

// Función para cerrar sesión
function logoutUser() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userInfo');
    window.location.href = 'login.html';
}

// Función para obtener el token
function getToken() {
    const token = localStorage.getItem('userToken');
    console.log('Token obtenido de localStorage:', token); // Añade esto
    return token;
}

// Función para obtener la información del usuario logueado
function getUserInfo() {
    const userInfo = localStorage.getItem('userInfo');
    return userInfo ? JSON.parse(userInfo) : null;
}

// Función para verificar autenticación (proteger rutas)
function checkAuth() {
    // Si estamos en login.html y ya hay token, redirigir a dashboard
    if (window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('login')) {
        if (getToken()) {
            window.location.href = 'dashboard.html';
        }
    } 
    // Si no estamos en login.html y NO hay token, redirigir a login
    else if (!getToken()) {
        window.location.href = 'login.html';
    }
}


// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Lógica para la página de login
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const emailInput = document.getElementById('email');
            const passwordInput = document.getElementById('password');
            if (emailInput && passwordInput) {
                loginUser(emailInput.value, passwordInput.value);
            }
        });
    }

    // Lógica para el botón de logout (que estará en dashboard.html)
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', (event) => {
            event.preventDefault();
            logoutUser();
        });
    }

    // Verificar autenticación en cada carga de página que incluya este script.
    // La lógica interna de checkAuth decide si redirigir o no.
    checkAuth(); 
});