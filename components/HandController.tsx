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
  
  // Smoothing refs
  const smoothPosRef = useRef({ x: 0, y: 0 });
  const lastGestureTypeRef = useRef<HandGesture['type']>('NONE');

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

        // Raw Coordinates: MediaPipe X is 0 (left) to 1 (right). 
        const rawX = (landmarks[9].x - 0.5) * 2; // -1 to 1
        const rawY = -(landmarks[9].y - 0.5) * 2; // Invert Y: -1 (bot) to 1 (top)

        // Smoothing (Lerp)
        const lerpFactor = 0.2; // 0.1 is very smooth/slow, 0.5 is snappy
        smoothPosRef.current.x = smoothPosRef.current.x + (rawX - smoothPosRef.current.x) * lerpFactor;
        smoothPosRef.current.y = smoothPosRef.current.y + (rawY - smoothPosRef.current.y) * lerpFactor;

        let type: HandGesture['type'] = 'OPEN';

        // Thresholds
        if (pinchDist < 0.05) {
          type = 'PINCH';
        } else if (avgDistToWrist < 0.25) { 
          // Fingers curled into palm
          type = 'CLOSED';
        } else {
          type = 'OPEN';
        }

        // Debounce gesture type slightly to prevent flickering? 
        // For now, raw type is fine, but position is smoothed.
        
        onGestureChange({
          type,
          position: { ...smoothPosRef.current },
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