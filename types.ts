import { Vector3 } from 'three';

export enum AppState {
  ASSEMBLED = 'ASSEMBLED',   // The Tree shape
  SCATTERED = 'SCATTERED',   // Floating particles
  INSPECTING = 'INSPECTING', // Viewing a specific photo
}

export interface ParticleData {
  id: number;
  position: Vector3; // Current visual position
  targetTree: Vector3; // Position in tree formation
  targetScattered: Vector3; // Position in cloud formation
  type: 'sphere' | 'cube' | 'candy';
  color: string;
  scale: number;
  rotationSpeed: Vector3;
}

export interface PhotoData {
  id: string;
  url: string;
  position: Vector3;
  targetTree: Vector3;
  targetScattered: Vector3;
  rotation: Vector3;
}

export interface HandGesture {
  type: 'OPEN' | 'CLOSED' | 'PINCH' | 'NONE';
  position: { x: number; y: number }; // Normalized 0-1
  isDetected: boolean;
}