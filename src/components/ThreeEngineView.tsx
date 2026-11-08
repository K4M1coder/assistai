import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Artifact3D } from '../types';
import { Box, RefreshCw, Eye, Sparkles, Layers, Sliders } from 'lucide-react';

interface ThreeEngineViewProps {
  artifact?: Artifact3D | null;
  interactive?: boolean;
}

export const ThreeEngineView: React.FC<ThreeEngineViewProps> = ({
  artifact,
  interactive = true,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState<boolean>(artifact?.wireframe ?? false);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [rotationSpeed, setRotationSpeed] = useState<number>(1);
  const [activeMaterial, setActiveMaterial] = useState<'hologram' | 'metallic' | 'glass' | 'neon_wireframe'>(
    artifact?.material ?? 'hologram'
  );
  const [objectColor, setObjectColor] = useState<string>(artifact?.color ?? '#06b6d4');

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (artifact?.material) setActiveMaterial(artifact.material);
    if (artifact?.color) setObjectColor(artifact.color);
    if (artifact?.wireframe !== undefined) setWireframe(artifact.wireframe);
  }, [artifact]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Dimensions
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x050811);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.5, 4.5);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x06b6d4, 2.5);
    dirLight1.position.set(5, 8, 5);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xa855f7, 2.0);
    dirLight2.position.set(-5, -5, -3);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0x38bdf8, 3, 20);
    pointLight.position.set(0, 0, 2);
    scene.add(pointLight);

    // Starfield / Floating particles
    const particleCount = 200;
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 12;
      particlePositions[i + 1] = (Math.random() - 0.5) * 12;
      particlePositions[i + 2] = (Math.random() - 0.5) * 12;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.04,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Create Main Mesh
    const geomType = artifact?.geometryType ?? 'torus_knot';
    let geometry: THREE.BufferGeometry;

    switch (geomType) {
      case 'quantum_crystal':
      case 'icosahedron':
        geometry = new THREE.IcosahedronGeometry(1.2, 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(1.2, 48, 48);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32);
        break;
      case 'torus_knot':
      default:
        geometry = new THREE.TorusKnotGeometry(0.9, 0.28, 128, 32, 2, 3);
        break;
    }

    // Material
    const material = createMaterial(activeMaterial, objectColor, wireframe);
    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    scene.add(mesh);

    // Mouse drag interaction
    let isDragging = false;
    let prevMousePos = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !meshRef.current) return;
      const deltaX = e.clientX - prevMousePos.x;
      const deltaY = e.clientY - prevMousePos.y;
      meshRef.current.rotation.y += deltaX * 0.008;
      meshRef.current.rotation.x += deltaY * 0.008;
      prevMousePos = { x: e.clientX, y: e.clientY };
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const domElement = renderer.domElement;
    if (interactive) {
      domElement.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    // Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (meshRef.current && autoRotate) {
        meshRef.current.rotation.y += 0.45 * rotationSpeed * delta;
        meshRef.current.rotation.x += 0.25 * rotationSpeed * delta;
      }

      particles.rotation.y += 0.05 * delta;
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(newWidth, newHeight);
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (interactive) {
        domElement.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }
      geometry.dispose();
      material.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      if (container.contains(domElement)) {
        container.removeChild(domElement);
      }
    };
  }, [artifact?.geometryType]);

  // Update material dynamically without rebuilding scene
  useEffect(() => {
    if (!meshRef.current) return;
    const oldMat = meshRef.current.material as THREE.Material;
    const newMat = createMaterial(activeMaterial, objectColor, wireframe);
    meshRef.current.material = newMat;
    oldMat.dispose();
  }, [activeMaterial, objectColor, wireframe]);

  function createMaterial(type: string, color: string, isWireframe: boolean): THREE.Material {
    const col = new THREE.Color(color);
    switch (type) {
      case 'metallic':
        return new THREE.MeshStandardMaterial({
          color: col,
          metalness: 0.9,
          roughness: 0.15,
          wireframe: isWireframe,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: col,
          metalness: 0.1,
          roughness: 0.1,
          transmission: 0.9,
          opacity: 0.85,
          transparent: true,
          wireframe: isWireframe,
        });
      case 'neon_wireframe':
        return new THREE.MeshBasicMaterial({
          color: col,
          wireframe: true,
        });
      case 'hologram':
      default:
        return new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.4,
          roughness: 0.3,
          metalness: 0.6,
          transparent: true,
          opacity: 0.9,
          wireframe: isWireframe,
        });
    }
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
      {/* 3D Canvas Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 text-xs backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-semibold text-slate-200">
            {artifact?.title || 'Three.js 3D Engine Viewport'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 text-[10px] font-mono">
            {artifact?.geometryType || 'torus_knot'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="text-[11px] text-slate-500 hidden sm:inline">Drag to rotate</span>
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`p-1.5 rounded transition ${autoRotate ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-slate-800 text-slate-400'}`}
            title="Toggle Auto Spin"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-1.5 rounded transition ${wireframe ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-slate-800 text-slate-400'}`}
            title="Toggle Wireframe"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div ref={mountRef} className="flex-1 w-full relative min-h-[260px] cursor-grab active:cursor-grabbing" />

      {/* Floating Material & Shader Controls */}
      <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/85 backdrop-blur-md rounded-lg border border-slate-800 text-xs z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-medium text-[11px]">Material:</span>
          {(['hologram', 'metallic', 'glass', 'neon_wireframe'] as const).map((mat) => (
            <button
              key={mat}
              onClick={() => setActiveMaterial(mat)}
              className={`px-2 py-1 rounded text-[11px] capitalize transition ${
                activeMaterial === mat
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/50'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {mat.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px]">Hue:</span>
            {['#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ec4899'].map((c) => (
              <button
                key={c}
                onClick={() => setObjectColor(c)}
                className={`w-4 h-4 rounded-full border transition ${
                  objectColor === c ? 'scale-125 border-white shadow-md' : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
            <Sliders className="w-3 h-3 text-slate-400" />
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.2"
              value={rotationSpeed}
              onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
              className="w-16 accent-cyan-400 cursor-pointer h-1"
              title="Rotation Speed"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
