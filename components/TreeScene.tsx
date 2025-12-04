import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { AppState, HandGesture, ParticleData, PhotoData } from '../types';

// Declare R3F elements to fix TypeScript errors
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

interface TreeSceneProps {
  appState: AppState;
  particles: ParticleData[];
  photos: PhotoData[];
  gesture: HandGesture;
  onPhotoSelect: (id: string | null) => void;
}

// Bypass strict type checking for THREE members that are flagged as missing in this environment
const T = THREE as any;

// Reusable geometries and materials for better performance
const sphereGeo = new T.SphereGeometry(1, 16, 16);
const cubeGeo = new T.BoxGeometry(1, 1, 1);
const cylinderGeo = new T.CylinderGeometry(0.3, 0.3, 2, 8); // Candy caneish

const redMat = new T.MeshStandardMaterial({ 
  color: '#8A1C1C', 
  roughness: 0.4, 
  metalness: 0.6 
});

const tempObject = new T.Object3D();
const tempColor = new T.Color();

const TreeScene: React.FC<TreeSceneProps> = ({ appState, particles, photos, gesture, onPhotoSelect }) => {
  const { camera } = useThree();
  const groupRef = useRef<any>(null);
  
  // Refs for Instanced Meshes
  const spheresRef = useRef<any>(null);
  const cubesRef = useRef<any>(null);
  const candysRef = useRef<any>(null);
  
  // Track hover state to dampen rotation
  const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);

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
        // Base rotation - PAUSE IF INSPECTING
        if (appState !== AppState.INSPECTING) {
             groupRef.current.rotation.y += 0.05 * delta;
        }

        // Hand controlled rotation when SCATTERED
        if (appState === AppState.SCATTERED && gesture.isDetected) {
           // If we are hovering over a photo, PAUSE/SLOW rotation to allow easy pinch
           const dampener = hoveredPhotoId ? 0.05 : 1.0;

           const targetRotY = gesture.position.x * 2; // Map hand X to rotation
           const targetRotX = gesture.position.y * 0.5;
           
           // Lerp towards target
           groupRef.current.rotation.y = T.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.05 * dampener);
           groupRef.current.rotation.x = T.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.05 * dampener);
        } else if (appState !== AppState.INSPECTING) {
             // Return to upright if not inspecting
             groupRef.current.rotation.x = T.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
        }
    }

    // 2. Animate Particles
    const t = 3 * delta; // Lerp speed

    const updateMesh = (ref: React.RefObject<any>, subset: ParticleData[]) => {
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
             if (dist < 8) tempObject.position.multiplyScalar(1.05);
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

  const handleHover = useCallback((id: string | null) => {
      setHoveredPhotoId(id);
  }, []);

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
          onHoverChange={handleHover}
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
    onHoverChange: (id: string | null) => void;
}> = ({ data, appState, gesture, onSelect, onHoverChange }) => {
    const meshRef = useRef<any>(null);
    const texture = useTexture(data.url);
    const [hovered, setHovered] = useState(false);
    const [active, setActive] = useState(false);

    // Sync local hover with parent to control rotation
    useEffect(() => {
        if (hovered) {
            onHoverChange(data.id);
        } else {
            // Only clear if we were the one hovering (simple check, imperfect but works for single hand)
            onHoverChange(null);
        }
    }, [hovered, data.id, onHoverChange]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const target = appState === AppState.ASSEMBLED ? data.targetTree : data.targetScattered;
        const speed = 4 * delta;

        if (active && appState === AppState.INSPECTING) {
            // --- INSPECTION LOGIC ---
            // 1. Calculate Target Position: Straight in front of camera
            // Camera is typically at (0, 0, 20). We place photo at (0, 0, 14) so it fills screen nicely.
            const targetWorldPos = new THREE.Vector3(0, 0, 14);

            // 2. Convert World Position to Local Space
            // Because the parent group might be rotated, we need to map the "Screen Center" 
            // back into the rotated local coordinate system of the tree.
            if (meshRef.current.parent) {
                const parent = meshRef.current.parent;
                // Get inverse of parent world matrix
                const parentWorldInv = parent.matrixWorld.clone().invert();
                // Apply inverse to our desired world target
                targetWorldPos.applyMatrix4(parentWorldInv);
            }

            // Lerp position to this calculated local target
            meshRef.current.position.lerp(targetWorldPos, speed);

            // 3. Rotation: Always face the camera
            // lookAt works in World Space, so it's straightforward
            meshRef.current.lookAt(state.camera.position.x, state.camera.position.y, state.camera.position.z);
            
            // 4. Scale up
            meshRef.current.scale.setScalar(T.MathUtils.lerp(meshRef.current.scale.x, 6, speed));

        } else {
            // --- STANDARD BEHAVIOR ---
            meshRef.current.position.lerp(target, speed);
            
            // Orientation logic
            if (appState === AppState.ASSEMBLED) {
                 // Face outward from center
                 meshRef.current.lookAt(0, meshRef.current.position.y, 0);
            } else {
                 // Idle rotation in scattered mode
                 meshRef.current.rotation.x += 0.01;
                 meshRef.current.rotation.y += 0.01;
            }
            
            // Scale logic (Hover effect)
            const targetScale = hovered && appState === AppState.SCATTERED ? 2.5 : 1.5;
            meshRef.current.scale.setScalar(T.MathUtils.lerp(meshRef.current.scale.x, targetScale, speed));
            
            // Reset Active state if we left inspecting mode
            if (appState !== AppState.INSPECTING && active) setActive(false);
        }
    });

    useFrame(({ camera }) => {
        if (!meshRef.current) return;
        
        if (gesture.isDetected) {
            // Project mesh position to screen space
            const pos = meshRef.current.position.clone();
            // Important: We need the World Position for projection, not local
            meshRef.current.getWorldPosition(pos);
            pos.project(camera); // Now in -1 to 1 range (NDC)
            
            // Gesture Mapping:
            // Gesture X is -1 (Left Hand/Screen Right) to 1 (Right Hand/Screen Left).
            // Screen NDC X is -1 (Left) to 1 (Right).
            // We want Phys Right (-1) to equal Screen Right (1). So -gesture.x.
            
            const dx = pos.x - (-gesture.position.x);
            const dy = pos.y - gesture.position.y;
            
            // Distance check
            const dist = Math.hypot(dx, dy);
            
            // Threshold
            const isOver = dist < 0.2; 
            
            if (isOver) {
                if (!hovered) setHovered(true);
                if (gesture.type === 'PINCH' && appState === AppState.SCATTERED) {
                    onSelect();
                    setActive(true);
                }
            } else {
                if (hovered) setHovered(false);
            }
        } else {
            if (hovered) setHovered(false);
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
                side={T.DoubleSide} 
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