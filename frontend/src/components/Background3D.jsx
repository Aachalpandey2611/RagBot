import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  Icosahedron,
  MeshDistortMaterial,
  Stars,
  Torus,
} from "@react-three/drei";

function RotatingStars() {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) {
      ref.current.rotation.x -= 0.0001;
      ref.current.rotation.y -= 0.0002;
    }
  });

  return (
    <group ref={ref}>
      <Stars
        radius={140}
        depth={70}
        count={6500}
        factor={5}
        saturation={0}
        fade
        speed={0.6}
      />
    </group>
  );
}

function FloatingForms() {
  return (
    <>
      <Float speed={1.4} rotationIntensity={1.6} floatIntensity={1.8}>
        <Icosahedron args={[1.05, 1]} position={[-3.1, 1.2, -2]}>
          <MeshDistortMaterial
            color="#2f81f7"
            transparent
            opacity={0.32}
            distort={0.28}
            speed={1.8}
            roughness={0.2}
          />
        </Icosahedron>
      </Float>
      <Float speed={1.2} rotationIntensity={1.1} floatIntensity={1.4}>
        <Torus
          args={[0.9, 0.23, 24, 70]}
          position={[2.8, -1.3, -1.3]}
          rotation={[0.8, 0.2, 0.3]}
        >
          <MeshDistortMaterial
            color="#1f6feb"
            transparent
            opacity={0.24}
            distort={0.18}
            speed={1.4}
            roughness={0.15}
          />
        </Torus>
      </Float>
    </>
  );
}

export default function Background3D() {
  return (
    <div className="fixed inset-0 z-[-1] bg-dark-900 pointer-events-none">
      <Canvas camera={{ position: [0, 0, 5], fov: 55 }}>
        <ambientLight intensity={0.8} />
        <directionalLight
          position={[4, 5, 3]}
          intensity={1.2}
          color="#5aa2ff"
        />
        <pointLight position={[-4, -2, 2]} intensity={0.7} color="#2f81f7" />
        <RotatingStars />
        <FloatingForms />
      </Canvas>
    </div>
  );
}
