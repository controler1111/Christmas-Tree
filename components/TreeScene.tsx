import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture, Text, Billboard, Float } from '@react-three/drei';
import * as THREE from 'three';
import { AppState, HandGesture, ParticleData, PhotoData } from '../types';

interface TreeSceneProps {
  appState: AppState;
  particles: ParticleData[];
  photos: PhotoData[];
  gesture: HandGesture;
  onPhotoSelect: (id: string | null) => void;
}

// Reusable geometries and materials for better performance
const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(0.3, 0.3, 2, 8); // Candy caneish

const goldMat = new THREE.MeshStandardMaterial({ 
  color: '#D4AF37', 
  roughness: 0.2, 
  metalness: 0.9,
  emissive: '#aa8800',
  emissiveIntensity: 0.2
});
const redMat = new THREE.MeshStandardMaterial({ 
  color: '#8A1C1C', 
  roughness: 0.4, 
  metalness: 0.6 
});
const greenMat = new THREE.MeshStandardMaterial({ 
  color: '#0F3B28', 
  roughness: 0.8, 
  metalness: 0.1 
});

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

const TreeScene: React.FC<TreeSceneProps> = ({ appState, particles, photos, gesture, onPhotoSelect }) => {
  const { camera, raycaster, pointer } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  
  // Refs for Instanced Meshes
  const spheresRef = useRef<THREE.InstancedMesh>(null);
  const cubesRef = useRef<THREE.InstancedMesh>(null);
  const candysRef = useRef<THREE.InstancedMesh>(null);

  // Group particles by type for instancing
  const particlesByType = useMemo(() => {
    return {
      sphere: particles.filter(p => p.type === 'sphere'),
      cube: particles.filter(p => p.type === 'cube'),
      candy: particles.filter(p => p.type === 'candy'),
    };
  }, [particles]);

  // Handle Photo Selection Logic via Raycaster (mapped from Hand)
  useEffect(() => {
    if (appState === AppState.INSPECTING && gesture.type !== 'PINCH') {
        // Drop photo if not pinching
        onPhotoSelect(null);
    }
  }, [appState, gesture.type, onPhotoSelect]);

  useFrame((state, delta) => {
    // 1. Global Rotation based on Gesture
    if (groupRef.current) {
        // Base rotation
        groupRef.current.rotation.y += 0.05 * delta;

        // Hand controlled rotation when SCATTERED
        if (appState === AppState.SCATTERED && gesture.isDetected) {
           const targetRotY = gesture.position.x * 2; // Map hand X to rotation
           const targetRotX = gesture.position.y * 0.5;
           
           groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.05);
           groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.05);
        } else {
             // Return to upright
             groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
        }
    }

    // 2. Animate Particles
    const t = 3 * delta; // Lerp speed

    const updateMesh = (ref: React.RefObject<THREE.InstancedMesh>, subset: ParticleData[]) => {
      if (!ref.current) return;
      
      subset.forEach((p, i) => {
        // Determine target
        const target = appState === AppState.ASSEMBLED ? p.targetTree : p.targetScattered;
        
        // Move current pos towards target
        p.position.lerp(target, t * (0.5 + Math.random())); // Randomize speed slightly for organic feel

        tempObject.position.copy(p.position);
        
        // Inspect mode: Push particles away from center to clear view
        if (appState === AppState.INSPECTING) {
             const dist = tempObject.position.length();
             if (dist < 5) tempObject.position.multiplyScalar(1.05);
        }

        // Rotation
        tempObject.rotation.x += p.rotationSpeed.x;
        tempObject.rotation.y += p.rotationSpeed.y;
        tempObject.scale.setScalar(p.scale);
        
        tempObject.updateMatrix();
        ref.current!.setMatrixAt(i, tempObject.matrix);
        
        // Color
        tempColor.set(p.color);
        ref.current!.setColorAt(i, tempColor);
      });
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    };

    updateMesh(spheresRef, particlesByType.sphere);
    updateMesh(cubesRef, particlesByType.cube);
    updateMesh(candysRef, particlesByType.candy);
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={spheresRef} args={[sphereGeo, undefined, particlesByType.sphere.length]}>
        <meshStandardMaterial roughness={0.3} metalness={0.8} />
      </instancedMesh>
      
      <instancedMesh ref={cubesRef} args={[cubeGeo, undefined, particlesByType.cube.length]}>
         <meshStandardMaterial roughness={0.3} metalness={0.8} />
      </instancedMesh>

      <instancedMesh ref={candysRef} args={[cylinderGeo, redMat, particlesByType.candy.length]} />

      {/* Render Photos */}
      {photos.map((photo) => (
        <PhotoFrame 
          key={photo.id} 
          data={photo} 
          appState={appState} 
          gesture={gesture}
          onSelect={() => onPhotoSelect(photo.id)}
        />
      ))}
    </group>
  );
};

// --- Photo Component ---
const PhotoFrame: React.FC<{ 
    data: PhotoData; 
    appState: AppState; 
    gesture: HandGesture;
    onSelect: () => void;
}> = ({ data, appState, gesture, onSelect }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const texture = useTexture(data.url);
    const [hovered, setHovered] = useState(false);
    const [active, setActive] = useState(false);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const target = appState === AppState.ASSEMBLED ? data.targetTree : data.targetScattered;
        const speed = 4 * delta;

        if (active && appState === AppState.INSPECTING) {
            // Bring to center camera
            meshRef.current.position.lerp(new THREE.Vector3(0, 0, 10), speed);
            meshRef.current.rotation.set(0, 0, 0); // Face forward
            meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, 6, speed));
        } else {
            // Standard behavior
            meshRef.current.position.lerp(target, speed);
            
            // Look at center usually
            if (appState === AppState.ASSEMBLED) {
                 meshRef.current.lookAt(0, meshRef.current.position.y, 0);
            } else {
                 meshRef.current.rotation.x += 0.01;
                 meshRef.current.rotation.y += 0.01;
            }
            
            // Hover scale effect
            const targetScale = hovered && appState === AppState.SCATTERED ? 2.5 : 1.5;
            meshRef.current.scale.setScalar(THREE.MathUtils.lerp(meshRef.current.scale.x, targetScale, speed));
            
            // Reset Active state if we left inspecting mode
            if (appState !== AppState.INSPECTING && active) setActive(false);
        }
    });

    // Raycast logic handled by onPointerOver/Out events from Fiber
    // BUT we need to connect it to the Hand Cursor. 
    // For this demo, to ensure robustness, we'll use a simple distance check in useFrame
    // if the hand is used, OR use standard mouse events for desktop fallback.
    
    useFrame(({ camera }) => {
        if (!meshRef.current) return;
        
        if (gesture.isDetected) {
            // Project mesh position to screen space
            const pos = meshRef.current.position.clone();
            pos.project(camera); // Now in -1 to 1 range
            
            // Hand position is -1 to 1 (X) and -1 to 1 (Y) approximately
            // Invert Hand Y was done in controller, let's check distance
            const dist = Math.hypot(pos.x - (-gesture.position.x), pos.y - gesture.position.y);
            
            // Threshold for interaction
            const isOver = dist < 0.15; // 15% of screen
            
            if (isOver) {
                if (!hovered) setHovered(true);
                if (gesture.type === 'PINCH' && appState === AppState.SCATTERED) {
                    onSelect();
                    setActive(true);
                }
            } else {
                if (hovered) setHovered(false);
            }
        }
    });

    return (
        <mesh 
            ref={meshRef}
            onPointerOver={() => !gesture.isDetected && setHovered(true)}
            onPointerOut={() => !gesture.isDetected && setHovered(false)}
            onClick={() => {
                if (!gesture.isDetected && appState === AppState.SCATTERED) {
                    onSelect();
                    setActive(true);
                }
            }}
        >
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial 
                map={texture} 
                side={THREE.DoubleSide} 
                transparent 
                opacity={0.9} 
                emissive={hovered ? '#444' : '#000'}
            />
            {/* Gold Frame */}
            <mesh position={[0, 0, -0.05]}>
                <boxGeometry args={[1.1, 1.1, 0.05]} />
                <meshStandardMaterial color="#D4AF37" metalness={1} roughness={0.1} />
            </mesh>
        </mesh>
    );
};

export default TreeScene;