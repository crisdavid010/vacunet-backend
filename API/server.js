const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken'); // Para JSON Web Tokens
const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuración ---
const JWT_SECRET = 'tu_super_secreto_para_jwt_deberia_ser_largo_y_complejo_y_estar_en_env_vars'; // ¡CAMBIA ESTO Y GUÁRDALO DE FORMA SEGURA!

// Middlewares
app.use(cors());
app.use(express.json());

// --- Configuración de la Conexión a MySQL ---
const dbConfig = {
    host: 'localhost',
    user: 'root', // Reemplazar por user de la BD
    password: 'CDAQ0822', // Reemplazar por PW de la BD
    port: 3306, // Puerto por defecto de MySQL
    database: 'vacunetapp', // nombre de la BD 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

// Variable para simular la generación de IDs para citas
let nextManualCitaId = 0;
async function initializeNextCitaId() {
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute("SELECT MAX(id_cita) as maxId FROM cita");
        nextManualCitaId = (rows[0] && rows[0].maxId) ? rows[0].maxId + 1 : 1;
        console.log("Próximo ID de cita inicializado en:", nextManualCitaId);
    } catch (error) {
        console.error("Error inicializando nextManualCitaId:", error);
        nextManualCitaId = 1;
    } finally {
        if (connection) connection.release();
    }
}
initializeNextCitaId();

// --- Middleware de Autenticación con JWT ---
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearerToken = bearerHeader.split(' ')[1]; // Formato "Bearer <token>"
        jwt.verify(bearerToken, JWT_SECRET, (err, decodedToken) => {
            if (err) {
                console.log("Error verificando token:", err.message);
                return res.sendStatus(403); // Forbidden (token inválido o expirado)
            }
            req.user = decodedToken; // Añade info del usuario al request (ej. id, email, rol)
            console.log("Token verificado, usuario:", req.user.email, "rol:", req.user.rol);
            next();
        });
    } else {
        console.log("No se encontró token en la cabecera 'authorization'");
        res.sendStatus(401); // error cuando no hay  token 
    }
}

// --- Rutas de la API (prefijo /api/v1) ---
const apiRouter = express.Router();

// --- Rutas de Autenticación (NO PROTEGIDAS POR verifyToken) ---
const authRouter = express.Router();
authRouter.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son requeridos." });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        const [users] = await connection.execute(
            "SELECT id_usuario_dashboard, email, nombre, password_texto, rol FROM usuarios_dashboard WHERE email = ?",
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ message: "Credenciales inválidas (usuario no encontrado)." });
        }

        const user = users[0];

        // Comparación directa de contraseña en texto plano (NO SEGURO)
        if (password === user.password_texto) {
            // Contraseña correcta, generar JWT
            const tokenPayload = {
                id: user.id_usuario_dashboard,
                email: user.email,
                nombre: user.nombre,
                rol: user.rol
            };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' }); // Token expira en 1 hora

            res.json({
                message: "Login exitoso",
                token: token,
                user: { // Enviar algo de info del usuario, sin la contraseña
                    id: user.id_usuario_dashboard,
                    nombre: user.nombre,
                    email: user.email,
                    rol: user.rol
                }
            });
        } else {
            res.status(401).json({ message: "Credenciales inválidas (contraseña incorrecta)." });
        }
    } catch (error) {
        console.error("Error en POST /auth/login:", error);
        res.status(500).json({ message: "Error en el servidor durante el login.", error: error.message });
    } finally {
        if (connection) connection.release();
    }
});
app.use('/api/v1/auth', authRouter); // Montar rutas de autenticación


// --- Rutas Protegidas (TODAS USAN verifyToken) ---

// Endpoint: GET /api/v1/appointments
apiRouter.get('/appointments', verifyToken, async (req, res) => { // PROTEGIDO
    let connection;
    try {
        // req.user está disponible aquí si se necesita para filtrar por rol, etc.
        // console.log("Usuario accediendo a /appointments:", req.user.email);
        connection = await pool.getConnection();
        const query = `
            SELECT 
                c.id_cita, c.fecha_hora, c.numero_dosis_aplicada, c.status,
                c.paciente AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido,
                c.id_vacuna_tipo, vt.nombre AS vacuna_nombre,
                c.id_lote_asignado, li.numero_lote
            FROM cita c
            JOIN paciente p ON c.paciente = p.id_paciente
            JOIN vacunas vt ON c.id_vacuna_tipo = vt.id_vacunas
            LEFT JOIN lotes_inventario li ON c.id_lote_asignado = li.id_lote_inventario
            WHERE c.status IN ('pendiente', 'confirmada') 
            ORDER BY c.fecha_hora ASC;
        `;
        const [citasFromDB] = await connection.execute(query);
        const citasParaEnviar = citasFromDB.map(cita => ({
            id: cita.id_cita, appointmentDate: cita.fecha_hora, userId: cita.paciente_id,
            user: { name: `${cita.paciente_nombre} ${cita.paciente_apellido}` },
            vaccineId: cita.id_vacuna_tipo, vaccine: { name: cita.vacuna_nombre },
            doseNumber: cita.numero_dosis_aplicada, status: cita.status, loteAsignado: cita.numero_lote
        }));
        res.json(citasParaEnviar);
    } catch (error) {
        console.error("Error en GET /appointments:", error);
        res.status(500).json({ message: "Error al obtener citas", error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint: PUT /api/v1/appointments/:appointmentId/status
apiRouter.put('/appointments/:appointmentId/status', verifyToken, async (req, res) => { // PROTEGIDO
    const appointmentId = parseInt(req.params.appointmentId);
    const { status } = req.body;
    let connection;

    if (!status) return res.status(400).json({ message: "El nuevo estado (status) es requerido." });

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        let loteAsignadoId = null;
        let idVacunaTipoCita = null;

        const [citaData] = await connection.execute("SELECT id_vacuna_tipo, id_lote_asignado FROM cita WHERE id_cita = ?", [appointmentId]);
        if (citaData.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Cita no encontrada." });
        }
        idVacunaTipoCita = citaData[0].id_vacuna_tipo;
        loteAsignadoId = citaData[0].id_lote_asignado;

        if (status === 'completada' && !loteAsignadoId) {
            const [lotesDisponibles] = await connection.execute(
                "SELECT id_lote_inventario FROM lotes_inventario WHERE id_vacuna_tipo = ? AND cantidad_disponible > 0 ORDER BY fecha_caducidad ASC LIMIT 1",
                [idVacunaTipoCita]
            );
            if (lotesDisponibles.length > 0) {
                loteAsignadoId = lotesDisponibles[0].id_lote_inventario;
                const [updateLoteResult] = await connection.execute(
                    "UPDATE lotes_inventario SET cantidad_disponible = cantidad_disponible - 1 WHERE id_lote_inventario = ? AND cantidad_disponible > 0",
                    [loteAsignadoId]
                );
                if (updateLoteResult.affectedRows === 0) {
                    await connection.rollback();
                    return res.status(409).json({ message: "Conflicto de stock al asignar lote." });
                }
            } else {
                await connection.rollback();
                return res.status(409).json({ message: `No hay stock para completar la cita con vacuna tipo ${idVacunaTipoCita}.` });
            }
        }
        const [updateCitaResult] = await connection.execute(
            "UPDATE cita SET status = ?, id_lote_asignado = ? WHERE id_cita = ?",
            [status, loteAsignadoId, appointmentId]
        );
        if (updateCitaResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Cita no encontrada al actualizar." });
        }
        await connection.commit();
        res.json({ message: "Estado de la cita actualizado.", id_cita: appointmentId, nuevo_status: status, lote_asignado: loteAsignadoId });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(`Error en PUT /appointments/${appointmentId}/status:`, error);
        res.status(500).json({ message: "Error al actualizar estado de la cita", error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint: GET /api/v1/vaccines (Inventario)
apiRouter.get('/vaccines', verifyToken, async (req, res) => { // PROTEGIDO
    let connection;
    try {
        connection = await pool.getConnection();
        const query = `
            SELECT 
                v.id_vacunas, v.nombre, v.fabricante, v.no_dosis, 
                COALESCE(SUM(li.cantidad_disponible), 0) AS currentStock 
            FROM vacunas v
            LEFT JOIN lotes_inventario li ON v.id_vacunas = li.id_vacuna_tipo
            GROUP BY v.id_vacunas, v.nombre, v.fabricante, v.no_dosis
            ORDER BY v.nombre;
        `;
        const [inventarioFromDB] = await connection.execute(query);
        const inventarioParaEnviar = inventarioFromDB.map(item => ({
            id_vacunas: item.id_vacunas, name: item.nombre, manufacturer: item.fabricante,
            dosesRequired: item.no_dosis, currentStock: parseInt(item.currentStock, 10)
        }));
        res.json(inventarioParaEnviar);
    } catch (error) {
        console.error("Error en GET /vaccines:", error);
        res.status(500).json({ message: "Error al obtener inventario", error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Endpoint: POST /api/v1/appointments (Crear cita)
apiRouter.post('/appointments', verifyToken, async (req, res) => { // PROTEGIDO
    let connection;
    const { userId: paciente_id, vaccineId: id_vacuna_tipo, appointmentDate: fecha_hora, doseNumber: numero_dosis_aplicada } = req.body;
    if (!paciente_id || !id_vacuna_tipo || !fecha_hora || numero_dosis_aplicada === undefined) {
        return res.status(400).json({ message: "Faltan campos requeridos." });
    }
    const id_cita_a_usar = nextManualCitaId;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [pacientes] = await connection.execute("SELECT id_paciente FROM paciente WHERE id_paciente = ?", [paciente_id]);
        if (pacientes.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Paciente ${paciente_id} no encontrado.` });
        }
        const [tiposVacuna] = await connection.execute("SELECT id_vacunas FROM vacunas WHERE id_vacunas = ?", [id_vacuna_tipo]);
        if (tiposVacuna.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: `Vacuna tipo ${id_vacuna_tipo} no encontrada.` });
        }
        const query = `
            INSERT INTO cita (id_cita, paciente, fecha_hora, id_vacuna_tipo, numero_dosis_aplicada, status) 
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        await connection.execute(query, [id_cita_a_usar, paciente_id, new Date(fecha_hora), id_vacuna_tipo, numero_dosis_aplicada, 'pendiente']);
        await connection.commit();
        nextManualCitaId++;
        res.status(201).json({ 
            message: "Cita creada.", id: id_cita_a_usar, paciente: paciente_id, id_vacuna_tipo: id_vacuna_tipo,
            fecha_hora: fecha_hora, numero_dosis_aplicada: numero_dosis_aplicada, status: 'pendiente'
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error("Error en POST /appointments:", error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: "ID de cita ya existe.", error: error.message });
        res.status(500).json({ message: "Error al crear la cita", error: error.message });
    } finally {
        if (connection) connection.release();
    }
});

// Montar el router principal de la API (que ahora contiene rutas protegidas)
app.use('/api/v1', apiRouter); //  verifyToken va aqui
// Ruta raíz de la API (no protegida)
app.get('/', (req, res) => {
    res.send('API de Vacunet s.a.s (Login  + JWT + MySQL) funcionando!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor API de VacunetApp (MySQL) escuchando en http://localhost:${PORT}`);
});