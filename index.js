const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const pool = require('./db');
const swaggerSpec = require('./swagger');

const app = express();
app.use(cors({ methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ---------- Utilidades ----------
class ErrorHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CAMPOS = ['NOMBRE', 'TITULO', 'UNIVERSIDAD', 'DISCIPLINA', 'DESCRIPCION', 'FOTO'];
const REQUERIDOS = ['NOMBRE', 'TITULO', 'DISCIPLINA'];
const MAX = { NOMBRE: 150, TITULO: 200, UNIVERSIDAD: 150, DISCIPLINA: 150, DESCRIPCION: 5000, FOTO: 500 };
const SELECT = 'SELECT id, NOMBRE, TITULO, UNIVERSIDAD, DISCIPLINA, DESCRIPCION, FOTO FROM Profesores';

// Toma solo los campos permitidos, recorta espacios y valida longitud / URL
function leerCampos(body) {
  const datos = {};
  for (const campo of CAMPOS) {
    if (body[campo] === undefined) continue;
    const valor = body[campo] === null ? '' : String(body[campo]).trim();
    if (valor.length > MAX[campo]) {
      throw new ErrorHttp(400, `${campo} supera los ${MAX[campo]} caracteres`);
    }
    datos[campo] = valor === '' ? null : valor;
  }
  if (datos.FOTO && !/^https?:\/\//i.test(datos.FOTO)) {
    throw new ErrorHttp(400, 'FOTO debe ser una URL que empiece con http:// o https://');
  }
  return datos;
}

function leerId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorHttp(400, 'El id debe ser un entero positivo');
  return id;
}

async function buscarPorId(id) {
  const [rows] = await pool.query(`${SELECT} WHERE id = ?`, [id]);
  return rows[0] || null;
}

const ruta = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    if (e instanceof ErrorHttp) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
};

// ---------- Endpoints ----------

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Verifica que el servicio esté activo
 *     tags: [Sistema]
 *     responses:
 *       200:
 *         description: Servicio activo
 */
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * @openapi
 * /api/profesores:
 *   get:
 *     summary: Lista los docentes
 *     tags: [Docentes]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         description: Filtra por nombre o disciplina (búsqueda parcial)
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de docentes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Profesor'
 */
app.get('/api/profesores', ruta(async (req, res) => {
  const q = String(req.query.q || '').trim();
  let rows;
  if (q) {
    const patron = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    [rows] = await pool.query(`${SELECT} WHERE NOMBRE LIKE ? OR DISCIPLINA LIKE ? ORDER BY id`, [patron, patron]);
  } else {
    [rows] = await pool.query(`${SELECT} ORDER BY id`);
  }
  res.json(rows);
}));

/**
 * @openapi
 * /api/profesores/{id}:
 *   get:
 *     summary: Consulta un docente por id
 *     tags: [Docentes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Docente encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profesor'
 *       400:
 *         description: Id inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Docente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.get('/api/profesores/:id', ruta(async (req, res) => {
  const profesor = await buscarPorId(leerId(req));
  if (!profesor) throw new ErrorHttp(404, 'Docente no encontrado');
  res.json(profesor);
}));

/**
 * @openapi
 * /api/profesores:
 *   post:
 *     summary: Inserta un docente
 *     tags: [Docentes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfesorInput'
 *     responses:
 *       201:
 *         description: Docente creado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profesor'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.post('/api/profesores', ruta(async (req, res) => {
  const datos = leerCampos(req.body ?? {});
  for (const campo of REQUERIDOS) {
    if (!datos[campo]) throw new ErrorHttp(400, `El campo ${campo} es obligatorio`);
  }
  datos.UNIVERSIDAD = datos.UNIVERSIDAD || 'UNINPAHU';

  const [resultado] = await pool.query(
    `INSERT INTO Profesores (NOMBRE, TITULO, UNIVERSIDAD, DISCIPLINA, DESCRIPCION, FOTO)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [datos.NOMBRE, datos.TITULO, datos.UNIVERSIDAD, datos.DISCIPLINA, datos.DESCRIPCION ?? null, datos.FOTO ?? null]
  );
  res.status(201).json(await buscarPorId(resultado.insertId));
}));

/**
 * @openapi
 * /api/profesores/{id}:
 *   put:
 *     summary: Actualiza un docente
 *     description: Solo se modifican los campos que se envíen en el cuerpo.
 *     tags: [Docentes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProfesorInput'
 *     responses:
 *       200:
 *         description: Docente actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Profesor'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Docente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.put('/api/profesores/:id', ruta(async (req, res) => {
  const id = leerId(req);
  const datos = leerCampos(req.body ?? {});
  const campos = Object.keys(datos);

  if (campos.length === 0) throw new ErrorHttp(400, 'No se envió ningún campo para actualizar');
  for (const campo of REQUERIDOS) {
    if (campo in datos && !datos[campo]) throw new ErrorHttp(400, `El campo ${campo} no puede quedar vacío`);
  }
  if ('UNIVERSIDAD' in datos && !datos.UNIVERSIDAD) datos.UNIVERSIDAD = 'UNINPAHU';

  const [resultado] = await pool.query(
    `UPDATE Profesores SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
    [...campos.map((c) => datos[c]), id]
  );
  if (resultado.affectedRows === 0) throw new ErrorHttp(404, 'Docente no encontrado');
  res.json(await buscarPorId(id));
}));

/**
 * @openapi
 * /api/profesores/{id}:
 *   delete:
 *     summary: Elimina un docente
 *     tags: [Docentes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         example: 1
 *     responses:
 *       200:
 *         description: Docente eliminado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 id: { type: integer, example: 1 }
 *       404:
 *         description: Docente no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
app.delete('/api/profesores/:id', ruta(async (req, res) => {
  const id = leerId(req);
  const [resultado] = await pool.query('DELETE FROM Profesores WHERE id = ?', [id]);
  if (resultado.affectedRows === 0) throw new ErrorHttp(404, 'Docente no encontrado');
  res.json({ ok: true, id });
}));

app.get('/', (_req, res) => res.redirect('/api-docs'));

// JSON mal formado u otros errores de middleware
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Docentes (CRUD) escuchando en puerto ${PORT}`));
