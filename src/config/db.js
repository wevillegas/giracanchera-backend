import mongoose from 'mongoose';

const ATTEMPTS = 5;
const WAIT_MS = 3000;

// Reintenta unas veces antes de rendirse: en un deploy la base puede tardar en estar lista
const connectDB = async () => {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI);
      console.log(`MongoDB conectado: ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(`Error al conectar a MongoDB (${attempt}/${ATTEMPTS}): ${error.message}`);
      if (attempt === ATTEMPTS) process.exit(1);
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
    }
  }
};

export default connectDB;
