import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandGesture } from '../types';

interface HandControllerProps {
  onGestureChange: (gesture: HandGesture) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}

const HandController: React.FC<HandControllerProps> = ({ onGestureChange, videoRef }) => {
  const [loaded, setLoaded] = useState(false);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        setLoaded(true);
      } catch (err) {
        console.error("Error initializing MediaPipe:", err);
      }
    };
    init();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      landmarkerRef.current?.close();
    };
  }, []);

  const detect = () => {
    if (!loaded || !landmarkerRef.current || !videoRef.current) return;
    
    if (videoRef.current.videoWidth > 0) {
      const results = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
      
      if (results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        
        // --- Gesture Logic ---
        
        // 1. Pinch Detection (Thumb Tip to Index Tip)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
        
        // 2. Open/Closed Logic (Tips to Wrist distance)
        const wrist = landmarks[0];
        const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
        let avgDistToWrist = 0;
        
        tips.forEach(idx => {
          const tip = landmarks[idx];
          avgDistToWrist += Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
        });
        avgDistToWrist /= tips.length;

        // Coordinates: MediaPipe X is 0 (left) to 1 (right). 
        // We invert X for mirroring effect if using front camera usually, 
        // but let's send raw normalized first.
        const position = { 
          x: (landmarks[9].x - 0.5) * 2, // Center 0, range -1 to 1
          y: -(landmarks[9].y - 0.5) * 2 // Invert Y for 3D mapping
        };

        let type: HandGesture['type'] = 'OPEN';

        // Thresholds need tuning
        if (pinchDist < 0.05) {
          type = 'PINCH';
        } else if (avgDistToWrist < 0.25) { 
          // Fingers curled into palm
          type = 'CLOSED';
        } else {
          type = 'OPEN';
        }

        onGestureChange({
          type,
          position,
          isDetected: true
        });
      } else {
        onGestureChange({ type: 'NONE', position: { x: 0, y: 0 }, isDetected: false });
      }
    }
    requestRef.current = requestAnimationFrame(detect);
  };

  useEffect(() => {
    if (loaded && videoRef.current) {
      detect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  return null; // Logic only
};

export default HandController;