import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import Club from '../models/Club.js';
import Stadium from '../models/Stadium.js';

const clubsData = [
  { name: 'Club Atlético Boca Juniors', shortName: 'Boca', logoUrl: '' },
  { name: 'Club Atlético River Plate', shortName: 'River', logoUrl: '' },
  { name: 'Club Atlético Vélez Sarsfield', shortName: 'Vélez', logoUrl: '' },
  { name: 'Club Atlético San Lorenzo de Almagro', shortName: 'San Lorenzo', logoUrl: '' },
  { name: 'Racing Club', shortName: 'Racing', logoUrl: '' },
  { name: 'Club Atlético Independiente', shortName: 'Independiente', logoUrl: '' },
  { name: 'Estudiantes de La Plata', shortName: 'Estudiantes', logoUrl: '' },
  { name: 'Club de Gimnasia y Esgrima La Plata', shortName: 'Gimnasia', logoUrl: '' },
  { name: 'Club Atlético Newell\'s Old Boys', shortName: 'Newell\'s', logoUrl: '' },
  { name: 'Club Atlético Rosario Central', shortName: 'Rosario Central', logoUrl: '' },
  { name: 'Club Atlético Talleres', shortName: 'Talleres', logoUrl: '' },
  { name: 'Club Atlético Belgrano', shortName: 'Belgrano', logoUrl: '' },
];

const stadiumsData = [
  {
    clubShortName: 'Boca',
    name: 'Estadio Alberto J. Armando (La Bombonera)',
    capacity: 54000,
    location: {
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.6356, lng: -58.3648 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'River',
    name: 'Estadio Antonio Vespucio Liberti (El Monumental)',
    capacity: 83214,
    location: {
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.5453, lng: -58.4497 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Vélez',
    name: 'Estadio José Amalfitani',
    capacity: 49540,
    location: {
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.6329, lng: -58.5013 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'San Lorenzo',
    name: 'Estadio Pedro Bidegain (El Nuevo Gasómetro)',
    capacity: 47964,
    location: {
      city: 'Buenos Aires',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.6521, lng: -58.3999 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Racing',
    name: 'Estadio Presidente Perón (El Cilindro)',
    capacity: 51389,
    location: {
      city: 'Avellaneda',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.6627, lng: -58.365 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Independiente',
    name: 'Estadio Libertadores de América',
    capacity: 48069,
    location: {
      city: 'Avellaneda',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.6537, lng: -58.3822 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Estudiantes',
    name: 'Estadio Jorge Luis Hirschi (El UNO)',
    capacity: 32000,
    location: {
      city: 'La Plata',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.9684, lng: -57.9502 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Gimnasia',
    name: 'Estadio Juan Carmelo Zerillo (El Bosque)',
    capacity: 24000,
    location: {
      city: 'La Plata',
      province: 'Buenos Aires',
      country: 'Argentina',
      coordinates: { lat: -34.9145, lng: -57.9544 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Newell\'s',
    name: 'Estadio Marcelo Bielsa (El Coloso del Parque)',
    capacity: 42000,
    location: {
      city: 'Rosario',
      province: 'Santa Fe',
      country: 'Argentina',
      coordinates: { lat: -32.9412, lng: -60.672 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Rosario Central',
    name: 'Estadio Gigante de Arroyito',
    capacity: 41654,
    location: {
      city: 'Rosario',
      province: 'Santa Fe',
      country: 'Argentina',
      coordinates: { lat: -32.9354, lng: -60.6435 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Talleres',
    name: 'Estadio Mario Alberto Kempes',
    capacity: 57000,
    location: {
      city: 'Córdoba',
      province: 'Córdoba',
      country: 'Argentina',
      coordinates: { lat: -31.32, lng: -64.2283 },
    },
    imageUrl: '',
  },
  {
    clubShortName: 'Belgrano',
    name: 'Estadio Julio César Villagra (Gigante de Alberdi)',
    capacity: 30000,
    location: {
      city: 'Córdoba',
      province: 'Córdoba',
      country: 'Argentina',
      coordinates: { lat: -31.3875, lng: -64.2111 },
    },
    imageUrl: '',
  },
];

const seed = async () => {
  try {
    await connectDB();

    await Club.deleteMany();
    await Stadium.deleteMany();

    const createdClubs = await Club.insertMany(clubsData);
    const clubMap = createdClubs.reduce((acc, club) => {
      acc[club.shortName] = club._id;
      return acc;
    }, {});

    const stadiumsToInsert = stadiumsData.map(({ clubShortName, ...stadium }) => ({
      ...stadium,
      mainClub: clubMap[clubShortName],
    }));

    await Stadium.insertMany(stadiumsToInsert);

    console.log('Seed completado con éxito: clubes y estadios de muestra creados.');
    process.exit(0);
  } catch (error) {
    console.error('Error al ejecutar el seed:', error.message);
    process.exit(1);
  }
};

seed();
