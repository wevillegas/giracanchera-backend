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
