// --- Funciones para Citas ---
async function fetchAppointments() {
    const token = getToken();
    console.log('Token usado para /appointments:', token); // Añade esto
    if (!token) {
        logoutUser();
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/appointments`, { // Usar API_BASE_URL global
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` // Enviar el token JWT
            }
        });

        if (response.status === 401 || response.status === 403) {
            // Token inválido o expirado
            logoutUser(); // Limpia el token y redirige a login
            return;
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Intenta parsear error
            throw new Error(errorData.message || `Error HTTP: ${response.status}`);
        }

        const appointments = await response.json();
        // El backend ahora devuelve un array directamente, ya no anidado en 'data'
        displayAppointments(appointments); // El backend debe devolver un array de citas

    } catch (error) {
        console.error('Error al obtener citas:', error);
        const citasTableBody = document.getElementById('citasTableBody');
        if (citasTableBody) {
            citasTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error al cargar citas: ${error.message}</td></tr>`;
        }
    }
}

function displayAppointments(appointments) {
    const tableBody = document.getElementById('citasTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!appointments || appointments.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center">No hay citas programadas o pendientes.</td></tr>';
        return;
    }

    appointments.forEach(app => { // La API ahora devuelve 'user.name' y 'vaccine.name'
        let row = tableBody.insertRow();
        const appointmentDate = new Date(app.appointmentDate);
        row.insertCell().textContent = appointmentDate.toLocaleDateString();
        row.insertCell().textContent = appointmentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        row.insertCell().textContent = app.user ? app.user.name : (app.userId || 'N/A'); // Usa el nombre si está, si no el ID
        row.insertCell().textContent = app.vaccine ? app.vaccine.name : (app.vaccineId || 'N/A');
        row.insertCell().textContent = app.doseNumber || 'N/A';
        row.insertCell().textContent = app.status || 'Pendiente';

        let actionsCell = row.insertCell();
        if (app.status !== 'completada' && app.status !== 'cancelada' && app.status !== 'completed' && app.status !== 'cancelled') { // Cubrir ambos casos
            let completeButton = document.createElement('button');
            completeButton.textContent = 'Completada';
            completeButton.className = 'btn btn-success btn-sm';
            completeButton.onclick = () => markAppointmentAsCompleted(app.id); // app.id es el id_cita
            actionsCell.appendChild(completeButton);
        } else {
            actionsCell.textContent = '-';
        }
    });
}

async function markAppointmentAsCompleted(appointmentId) {
    const token = getToken();
    if (!token) {
        logoutUser();
        return;
    }
    if (!confirm("¿Está seguro de marcar esta cita como completada?")) return;

    try {
        const response = await fetch(`${API_BASE_URL}/appointments/${appointmentId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'completada' }) // 'completada' como en el backend
        });

        if (response.status === 401 || response.status === 403) {
            logoutUser();
            return;
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error HTTP: ${response.status}`);
        }
        alert('Cita marcada como completada.');
        fetchAppointments();
    } catch (error) {
        console.error('Error al marcar cita como completada:', error);
        alert(`Error al actualizar la cita: ${error.message}`);
    }
}

// --- Funciones para Inventario ---
async function fetchInventory() {
    const token = getToken();
    console.log('Token usado para /vaccines:', token); // Añade esto
    if (!token) {
        logoutUser();
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/vaccines`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.status === 401 || response.status === 403) {
            logoutUser();
            return;
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Error HTTP: ${response.status}`);
        }
        const vaccines = await response.json();
        // La API devuelve un array de objetos con name, manufacturer, dosesRequired, currentStock
        displayInventory(vaccines);

    } catch (error) {
        console.error('Error al obtener inventario:', error);
        const inventarioTableBody = document.getElementById('inventarioTableBody');
        if (inventarioTableBody) {
            inventarioTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar inventario: ${error.message}</td></tr>`;
        }
    }
}

function displayInventory(vaccines) { // vaccines es el array directo de la API
    const tableBody = document.getElementById('inventarioTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (!vaccines || vaccines.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center">No hay vacunas en el inventario.</td></tr>';
        return;
    }

    vaccines.forEach(vac => {
        let row = tableBody.insertRow();
        row.insertCell().textContent = vac.name || 'N/A';
        row.insertCell().textContent = vac.manufacturer || 'N/A';
        row.insertCell().textContent = vac.dosesRequired || 'N/A';
        row.insertCell().textContent = vac.currentStock !== undefined ? vac.currentStock : 'N/A';
    });
}

// Cargar datos cuando el DOM esté listo y estemos en dashboard.html
document.addEventListener('DOMContentLoaded', () => {
    // checkAuth() es llamado desde auth.js.
    // Si checkAuth() no redirige, significa que estamos autenticados (o en login.html).
    // Solo cargar datos si estamos en dashboard.html y autenticados.
    if (window.location.pathname.endsWith('dashboard.html') && getToken()) {
        fetchAppointments();
        fetchInventory();
    }
});