import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { Environment, Loader, Stars } from '@react-three/drei';
import { AppState, HandGesture, ParticleData, PhotoData } from './types';
import { createParticles, createPhotoLayouts } from './utils/math';
import TreeScene from './components/TreeScene';
import HandController from './components/HandController';

// Declare R3F elements to fix TypeScript errors
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

// Default Placeholders
const DEFAULT_PHOTOS = [
  'https://picsum.photos/400/400?random=1',
  'https://picsum.photos/400/400?random=2',
  'https://picsum.photos/400/400?random=3',
  'https://picsum.photos/400/400?random=4',
  'https://picsum.photos/400/400?random=5',
  'https://picsum.photos/400/400?random=6',
  'https://picsum.photos/400/400?random=7',
  'https://picsum.photos/400/400?random=8',
];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.ASSEMBLED);
  const [particles, setParticles] = useState<ParticleData[]>([]);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [gesture, setGesture] = useState<HandGesture>({ type: 'NONE', position: { x: 0, y: 0 }, isDetected: false });
  const [permissionGranted, setPermissionGranted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Initialize
  useEffect(() => {
    // Generate static particles
    setParticles(createParticles(1200));
    setPhotos(createPhotoLayouts(DEFAULT_PHOTOS));
  }, []);

  // Handle Photo Uploads
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newUrls = Array.from(e.target.files).map(file => URL.createObjectURL(file));
      
      setPhotos(prevPhotos => {
        // Check if currently showing defaults (if so, we replace them, otherwise we append)
        const isDefault = prevPhotos.length > 0 && prevPhotos[0].url.includes('picsum.photos');
        
        let updatedUrls: string[];
        if (isDefault) {
           updatedUrls = newUrls;
        } else {
           // Append to existing user photos
           const currentUrls = prevPhotos.map(p => p.url);
           updatedUrls = [...currentUrls, ...newUrls];
        }
        
        return createPhotoLayouts(updatedUrls);
      });

      setAppState(AppState.SCATTERED); // Start scattered to see them
      
      // Reset input value so the same files can be selected again if needed
      e.target.value = '';
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setPermissionGranted(true);
      }
    } catch (err) {
      console.error("Camera denied:", err);
      alert("Please allow camera access for gesture control.");
    }
  };

  // State Logic based on Gestures
  const handleGestureChange = (newGesture: HandGesture) => {
    setGesture(newGesture);

    // Lock transitions during inspection
    if (appState === AppState.INSPECTING) {
       // Only exit inspecting if we release pinch or fist
       if (newGesture.type === 'CLOSED') {
           setAppState(AppState.ASSEMBLED);
       } else if (newGesture.type === 'OPEN') {
           setAppState(AppState.SCATTERED);
       }
       return;
    }

    if (newGesture.type === 'CLOSED') {
        setAppState(AppState.ASSEMBLED);
    } else if (newGesture.type === 'OPEN') {
        setAppState(AppState.SCATTERED);
    }
    // PINCH is handled in Scene for specific object interaction
  };

  const handlePhotoSelect = (id: string | null) => {
      if (id) {
          setAppState(AppState.INSPECTING);
      } else {
          // If we let go, return to previous state (usually Scattered)
          setAppState(AppState.SCATTERED);
      }
  };

  // Calculate cursor screen position (percentage)
  // Gesture X: -1 (Left Hand/Phys Right) to 1 (Right Hand/Phys Left)
  // We want Phys Right (-1) to be Screen Right (1) to match Mirrored Video
  // So Target X = -Gesture X
  const cursorX = gesture.isDetected ? (-gesture.position.x * 0.5 + 0.5) * 100 : 50;
  const cursorY = gesture.isDetected ? (gesture.position.y * -0.5 + 0.5) * 100 : 50;

  return (
    <div className="relative w-full h-screen bg-[#050505] text-white overflow-hidden font-sans cursor-none">
      
      {/* 3D Canvas */}
      <Canvas shadows camera={{ position: [0, 0, 20], fov: 45 }} gl={{ antialias: false }}>
        <color attach="background" args={['#020804']} />
        
        <Suspense fallback={null}>
            <Environment preset="city" />
            <ambientLight intensity={0.2} color="#0F3B28" />
            <pointLight position={[10, 10, 10]} intensity={1} color="#D4AF37" />
            <pointLight position={[-10, -5, -10]} intensity={0.5} color="#8A1C1C" />
            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            
            <TreeScene 
                appState={appState} 
                particles={particles} 
                photos={photos} 
                gesture={gesture}
                onPhotoSelect={handlePhotoSelect}
            />

            <EffectComposer enableNormalPass={false}>
                <Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.5} radius={0.5} />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
        </Suspense>
      </Canvas>
      
      <Loader />

      {/* Main Screen Cursor */}
      {gesture.isDetected && (
          <div 
            className="absolute w-8 h-8 rounded-full border-2 border-[#D4AF37] pointer-events-none z-50 transform -translate-x-1/2 -translate-y-1/2 mix-blend-difference shadow-[0_0_15px_#D4AF37]"
            style={{ 
                left: `${cursorX}%`,
                top: `${cursorY}%`,
                backgroundColor: gesture.type === 'PINCH' ? 'rgba(212, 175, 55, 0.8)' : 'transparent',
                scale: gesture.type === 'PINCH' ? 0.8 : 1,
                transition: 'scale 0.2s ease'
            }}
          >
             {/* Center dot */}
             <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full transform -translate-x-1/2 -translate-y-1/2" />
          </div>
      )}

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex flex-col justify-between p-8 z-10">
        
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
            <div>
                <h1 className="text-4xl font-serif text-[#D4AF37] tracking-widest drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]">
                    LUMIÈRE NOËL
                </h1>
                <p className="text-xs text-[#8A1C1C] uppercase tracking-[0.3em] mt-1 opacity-80">
                    Interactive Gesture Experience
                </p>
            </div>
            
            <div className="flex flex-col items-end gap-2">
                 <label className="bg-[#D4AF37] text-black px-4 py-2 text-sm font-bold uppercase hover:bg-white transition-colors cursor-pointer rounded-sm shadow-[0_0_15px_#D4AF37]">
                    Upload Photos
                    <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
                {!permissionGranted && (
                    <button 
                        onClick={startCamera}
                        className="bg-[#8A1C1C] text-white px-4 py-2 text-sm font-bold uppercase hover:bg-red-600 transition-colors rounded-sm"
                    >
                        Enable Camera
                    </button>
                )}
            </div>
        </div>

        {/* Instructions & Status */}
        <div className="flex justify-between items-end">
             <div className="space-y-4 max-w-md pointer-events-auto">
                 <div className="flex items-center gap-4 text-sm opacity-80 font-light">
                     <span className="w-8 h-8 rounded-full border border-[#D4AF37] flex items-center justify-center">✊</span>
                     <span>Fist to Assemble Tree</span>
                 </div>
                 <div className="flex items-center gap-4 text-sm opacity-80 font-light">
                     <span className="w-8 h-8 rounded-full border border-[#D4AF37] flex items-center justify-center">🖐</span>
                     <span>Open Hand to Scatter</span>
                 </div>
                 <div className="flex items-center gap-4 text-sm opacity-80 font-light">
                     <span className="w-8 h-8 rounded-full border border-[#D4AF37] flex items-center justify-center">👌</span>
                     <span>Pinch to Grab Photo</span>
                 </div>
             </div>

             <div className="text-right pointer-events-auto">
                 <div className="relative w-64 h-48 border border-[#1a4c35] bg-black/50 rounded overflow-hidden">
                     {/* Video Feed Mirror */}
                     <video 
                        ref={videoRef} 
                        className="w-full h-full object-cover transform scale-x-[-1]" 
                        muted 
                        playsInline
                     />
                     <div className="absolute bottom-1 right-1 text-[10px] text-[#D4AF37]">
                         {gesture.isDetected ? `DETECTED: ${gesture.type}` : 'NO HAND'}
                     </div>
                     {/* Debug Visualizer - Coordinates logic must match Screen Cursor */}
                     {gesture.isDetected && (
                         <div 
                            className="absolute w-3 h-3 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
                            style={{ 
                                // The Video element IS flipped, so "Left" on this container maps to "Right" in video visual.
                                // If Gesture X = -1 (Phys Right), we want cursor on the visual Right of this box.
                                // Visual Right is Left: 100%. 
                                // -1 -> 100%, 1 -> 0%
                                left: `${(-gesture.position.x * 0.5 + 0.5) * 100}%`,
                                top: `${cursorY}%`,
                                backgroundColor: gesture.type === 'PINCH' ? '#D4AF37' : 'rgba(255,255,255,0.5)'
                            }}
                         />
                     )}
                 </div>
             </div>
        </div>
      </div>

      {/* Logic Components */}
      <HandController onGestureChange={handleGestureChange} videoRef={videoRef} />
    </div>
  );
};

export default App;