import { Component, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import type { RendererProps } from '@vibequest/shared';

function webGlIsAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function CompatibilityRecovery() {
  return (
    <div className="compatibility-screen" data-testid="webgl-recovery" role="status">
      <span className="compatibility-icon" aria-hidden="true">◇</span>
      <h3>The district needs WebGL</h3>
      <p>Enable hardware acceleration in a current desktop browser, then reload. This preview requires 3D graphics.</p>
      <button className="button secondary" onClick={() => window.location.reload()}>Reload preview</button>
      <small>The world is unimplemented in Segment-000. Compatibility recovery does not start a game.</small>
    </div>
  );
}

class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <CompatibilityRecovery /> : this.props.children;
  }
}

function Building({ x, z, width, depth, color }: { x: number; z: number; width: number; depth: number; color: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh castShadow receiveShadow position={[0, 1.7, 0]}>
        <boxGeometry args={[width, 3.4, depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh castShadow position={[0, 3.5, 0]}>
        <boxGeometry args={[width + 0.35, 0.35, depth + 0.35]} />
        <meshStandardMaterial color="#1a4038" />
      </mesh>
    </group>
  );
}

function DistrictPreview() {
  return (
    <>
      <color attach="background" args={['#dce9de']} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[15, 30, 12]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.06, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#bacfb7" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, -1]}>
        <planeGeometry args={[34, 8]} />
        <meshStandardMaterial color="#f0e9d3" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0.01, 0]}>
        <planeGeometry args={[8, 34]} />
        <meshStandardMaterial color="#f0e9d3" />
      </mesh>
      <Building x={-12} z={7} width={7} depth={6} color="#de9874" />
      <Building x={10} z={7} width={5} depth={4} color="#edcf80" />
      <Building x={-13} z={-4} width={6} depth={5} color="#98b7a2" />
      <Building x={12} z={-4} width={7} depth={5} color="#91adb0" />
      {[-10, 0, 10].map((x) => (
        <group key={x} position={[x, 0, -12]}>
          <mesh receiveShadow position={[0, 0.18, 0]}>
            <boxGeometry args={[5.5, 0.3, 4]} />
            <meshStandardMaterial color="#8eaa9b" />
          </mesh>
          <mesh castShadow position={[0, 2.5, -0.9]}>
            <boxGeometry args={[6, 0.3, 3]} />
            <meshStandardMaterial color="#36594c" />
          </mesh>
          <mesh position={[-2.4, 1.3, -0.9]}>
            <boxGeometry args={[0.16, 2.5, 0.16]} />
            <meshStandardMaterial color="#36594c" />
          </mesh>
          <mesh position={[2.4, 1.3, -0.9]}>
            <boxGeometry args={[0.16, 2.5, 0.16]} />
            <meshStandardMaterial color="#36594c" />
          </mesh>
        </group>
      ))}
      <group position={[0, 0, 10]}>
        <mesh castShadow position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.42, 0.42, 1.1, 12]} />
          <meshStandardMaterial color="#ee925a" />
        </mesh>
        <mesh castShadow position={[0, 1.7, 0]}>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshStandardMaterial color="#f1d4b1" />
        </mesh>
      </group>
    </>
  );
}

/** Static greybox only. Segment-004 owns movement, camera, and interaction. */
export function WorldRenderer({ state }: RendererProps) {
  const [hasWebGl, setHasWebGl] = useState(webGlIsAvailable);

  return (
    <section className="world-renderer" aria-label="Mandarin district preview" data-testid="world-renderer">
      {hasWebGl ? (
        <CanvasBoundary>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [27, 32, 33], fov: 43 }}
            onCreated={({ gl, camera }) => {
              camera.lookAt(0, 0, 0);
              gl.domElement.addEventListener('webglcontextlost', () => setHasWebGl(false), { once: true });
            }}
            fallback={<CompatibilityRecovery />}
          >
            <DistrictPreview />
          </Canvas>
        </CanvasBoundary>
      ) : <CompatibilityRecovery />}
      {hasWebGl && (
        <>
          <div className="world-caption"><span className="live-dot" />District preview <span>Static greybox</span></div>
          <div className="world-location cafe"><span lang="zh-Hans">咖啡店</span><small>Café</small></div>
          <div className="world-location station"><span lang="zh-Hans">车站</span><small>Station</small></div>
          <div className="world-location plaza"><span lang="zh-Hans">广场</span><small>Plaza · Spawn</small></div>
          <div className="world-note">Movement & interaction unimplemented · Segment-004</div>
        </>
      )}
      <span className="sr-only">Fixture preview for {state.missionId}; no playable navigation.</span>
    </section>
  );
}
