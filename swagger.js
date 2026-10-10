const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API CRUD de Docentes',
      version: '1.0.0',
      description: 'Microservicio para crear, consultar, actualizar y eliminar docentes (MySQL)',
    },
    components: {
      schemas: {
        Profesor: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            NOMBRE: { type: 'string', example: 'Juan Pérez' },
            TITULO: { type: 'string', example: 'Magíster en Ingeniería de Software' },
            UNIVERSIDAD: { type: 'string', example: 'UNINPAHU' },
            DISCIPLINA: { type: 'string', example: 'Ingeniería de Sistemas' },
            DESCRIPCION: { type: 'string', nullable: true, example: 'Docente e investigador' },
            FOTO: { type: 'string', nullable: true, example: 'https://ejemplo.com/foto.jpg' },
          },
        },
        ProfesorInput: {
          type: 'object',
          required: ['NOMBRE', 'TITULO', 'DISCIPLINA'],
          properties: {
            NOMBRE: { type: 'string', example: 'Juan Pérez' },
            TITULO: { type: 'string', example: 'Magíster en Ingeniería de Software' },
            UNIVERSIDAD: { type: 'string', example: 'UNINPAHU', description: 'Por defecto UNINPAHU' },
            DISCIPLINA: { type: 'string', example: 'Ingeniería de Sistemas' },
            DESCRIPCION: { type: 'string', nullable: true },
            FOTO: { type: 'string', nullable: true, description: 'URL http(s) de la foto' },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string', example: 'Mensaje de error' } },
        },
      },
    },
  },
  apis: [path.join(__dirname, 'index.js')],
});
