import { Vector3, MathUtils } from 'three';
import { ParticleData, PhotoData } from '../types';

// Palette
const COLORS = [
  '#0F3B28', // Matte Green
  '#1a4c35', // Lighter Green
  '#D4AF37', // Metallic Gold
  '#F2D06B', // Light Gold
  '#8A1C1C', // Christmas Red
  '#5e1212', // Dark Red
];

export const generateTreePositions = (count: number, radius: number, height: number): Vector3[] => {
  const positions: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 20; // Spirals
    const y = height * (0.5 - t); // Top to bottom
    const r = radius * t; // Wider at bottom
    
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);
    positions.push(new Vector3(x, y, z));
  }
  return positions;
};

export const generateScatterPositions = (count: number, spread: number): Vector3[] => {
  const positions: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * spread;
    const y = (Math.random() - 0.5) * spread;
    const z = (Math.random() - 0.5) * spread;
    positions.push(new Vector3(x, y, z));
  }
  return positions;
};

export const createParticles = (count: number): ParticleData[] => {
  const treePos = generateTreePositions(count, 4, 10);
  const scatterPos = generateScatterPositions(count, 15);

  return treePos.map((pos, i) => ({
    id: i,
    position: new Vector3(0, 0, 0), // Start at center or random
    targetTree: pos,
    targetScattered: scatterPos[i],
    type: Math.random() > 0.7 ? 'cube' : (Math.random() > 0.9 ? 'candy' : 'sphere'),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    scale: Math.random() * 0.15 + 0.05,
    rotationSpeed: new Vector3(
      Math.random() * 0.02,
      Math.random() * 0.02,
      Math.random() * 0.02
    )
  }));
};

export const createPhotoLayouts = (photos: string[]): PhotoData[] => {
  const count = photos.length;
  // Photos spiral around the tree but slightly outside the ornaments
  const treePos = generateTreePositions(count, 5.5, 9); 
  const scatterPos = generateScatterPositions(count, 12);

  return photos.map((url, i) => ({
    id: `photo-${i}`,
    url,
    position: new Vector3(0, -10, 0),
    targetTree: treePos[i],
    targetScattered: scatterPos[i],
    rotation: new Vector3(0, Math.random() * Math.PI, 0)
  }));
};