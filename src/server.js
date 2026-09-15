// Debe ser el primer import: en ESM, Node evalúa todas las dependencias
// importadas (app.js -> rutas -> config/cloudinary.js, que lee process.env
// al cargarse) antes de correr el resto del código de este archivo. Si
// dotenv.config() se llama como una instrucción normal más abajo, corre
// demasiado tarde y Cloudinary queda configurado con variables undefined.
import 'dotenv/config';

import app from './app.js';
import connectDB from './config/db.js';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
  });
};

startServer();
