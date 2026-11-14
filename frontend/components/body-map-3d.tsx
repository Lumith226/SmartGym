'use client';

import * as React from 'react';
import { RotateCw, ZoomIn, ZoomOut, RefreshCw, Eye } from 'lucide-react';
import { cn } from '../lib/utils';
import type { MuscleGroup } from '../app/muscle-map';

export type BodyMap3DProps = {
  groups: MuscleGroup[];
  activeId?: string;
  onSelect: (id: string) => void;
  onHover?: (group: MuscleGroup | null) => void;
};

// Khai báo kiểu cho THREE trên window
declare global {
  interface Window {
    THREE: any;
  }
}

export function BodyMap3D({ groups, activeId, onSelect, onHover }: BodyMap3DProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [loading, setLoading] = React.useState(true);
  const [currentView, setCurrentView] = React.useState<'front' | 'back' | 'side'>('front');
  const [autoRotate, setAutoRotate] = React.useState(false);

  // Lưu theme hiện tại vào Ref để luôn đọc đúng và phản ứng tức thì
  const isDarkRef = React.useRef(false);

  // Lưu callbacks & props vào ref để không làm re-run useEffect khi re-render
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverRef = React.useRef(onHover);
  onHoverRef.current = onHover;
  const groupsRef = React.useRef(groups);
  groupsRef.current = groups;
  const activeIdRef = React.useRef(activeId);
  activeIdRef.current = activeId;

  // Tham chiếu các đối tượng Three.js
  const sceneRef = React.useRef<any>(null);
  const cameraRef = React.useRef<any>(null);
  const rendererRef = React.useRef<any>(null);
  const controlsRef = React.useRef<any>(null);
  const muscleMeshesRef = React.useRef<Map<string, any[]>>(new Map());
  const hoveredMeshRef = React.useRef<any>(null);
  const animFrameRef = React.useRef<number | null>(null);

  // Tham chiếu đèn và vật liệu để cập nhật động khi đổi theme Sáng / Tối
  const ambientLightRef = React.useRef<any>(null);
  const dirLight1Ref = React.useRef<any>(null);
  const dirLight2Ref = React.useRef<any>(null);
  const rimLightRef = React.useRef<any>(null);
  const neutralMatRef = React.useRef<any>(null);
  const shadowPlaneRef = React.useRef<any>(null);

  // Helper kiểm tra theme chuẩn xác
  function checkIsDark(): boolean {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  }

  // 1. Tải Three.js và OrbitControls từ vendor nội bộ
  React.useEffect(() => {
    let mounted = true;

    async function loadThree() {
      try {
        if (!window.THREE) {
          await loadScript('/vendor/three/three.min.js');
        }
        if (!window.THREE?.OrbitControls) {
          await loadScript('/vendor/three/OrbitControls.js');
        }
        if (mounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Không thể tải thư viện 3D:', err);
        if (mounted) setLoading(false);
      }
    }

    loadThree();
    return () => {
      mounted = false;
    };
  }, []);

  // 2. Khởi tạo Three.js Scene khi script đã tải (CHỈ chạy 1 lần khi loading chuyển false)
  React.useEffect(() => {
    if (loading || !containerRef.current || !window.THREE) return;

    try {
      const THREE = window.THREE;
      const container = containerRef.current;
      const width = container.clientWidth || 600;
      const height = container.clientHeight || 560;

      // Đồng bộ trạng thái Dark/Light mode
      const isDark = checkIsDark();
      isDarkRef.current = isDark;

      // Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 1.2, 3.8);
      cameraRef.current = camera;

      // Renderer với ACES Filmic Tone Mapping để không bị cháy sáng ở chế độ Light
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (THREE.ACESFilmicToneMapping) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = isDark ? 1.0 : 0.88;
      }
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Controls
      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 2.0;
      controls.maxDistance = 6.0;
      controls.maxPolarAngle = Math.PI / 1.8;
      controls.minPolarAngle = Math.PI / 4;
      controls.target.set(0, 1.0, 0);
      controlsRef.current = controls;

      // ── Ánh sáng Studio chuẩn xác (Khắc phục hoàn toàn lỗi lóa trắng ở Light Mode) ──
      // Ambient Light: Dịu nhẹ để giữ lại chiều sâu bóng đổ của từng múi cơ
      const ambientLight = new THREE.AmbientLight(
        isDark ? 0x1e2436 : 0xe2e8f0,
        isDark ? 0.95 : 0.5,
      );
      scene.add(ambientLight);
      ambientLightRef.current = ambientLight;

      // Key Light: Đèn chính chiếu từ góc trên trước mặt
      const dirLight1 = new THREE.DirectionalLight(0xffffff, isDark ? 1.1 : 0.65);
      dirLight1.position.set(3, 4, 3);
      scene.add(dirLight1);
      dirLight1Ref.current = dirLight1;

      // Fill Light: Đèn phụ bù sáng góc chéo
      const dirLight2 = new THREE.DirectionalLight(
        isDark ? 0x38bdf8 : 0x94a3b8,
        isDark ? 0.35 : 0.25,
      );
      dirLight2.position.set(-3, 2, -1);
      scene.add(dirLight2);
      dirLight2Ref.current = dirLight2;

      // Rim light tím Indigo thương hiệu SmartGym
      const rimLight = new THREE.DirectionalLight(
        isDark ? 0x6366f1 : 0x818cf8,
        isDark ? 1.4 : 0.4,
      );
      rimLight.position.set(0, 3, -3);
      scene.add(rimLight);
      rimLightRef.current = rimLight;

      // Dựng mô hình giải phẫu 3D (Human Anatomical Mannequin)
      buildHumanFigure(scene, THREE, isDark);

      // Cập nhật màu sắc ban đầu nếu có activeId
      updateMeshVisuals(activeIdRef.current, undefined, isDark);

      // Raycasting cho tương tác chuột
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      function onPointerMove(event: PointerEvent) {
        const currentDark = isDarkRef.current;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const allMeshes: any[] = [];
        muscleMeshesRef.current.forEach(meshes => allMeshes.push(...meshes));

        const intersects = raycaster.intersectObjects(allMeshes, true);
        if (intersects.length > 0) {
          const topMesh = intersects[0].object;
          const muscleId = topMesh.userData?.muscleId;
          if (muscleId && hoveredMeshRef.current !== topMesh) {
            hoveredMeshRef.current = topMesh;
            renderer.domElement.style.cursor = 'pointer';
            const grp = groupsRef.current.find(g => g.id === muscleId) || null;
            onHoverRef.current?.(grp);
            updateMeshVisuals(activeIdRef.current, muscleId, currentDark);
          }
        } else {
          if (hoveredMeshRef.current) {
            hoveredMeshRef.current = null;
            renderer.domElement.style.cursor = 'default';
            onHoverRef.current?.(null);
            updateMeshVisuals(activeIdRef.current, undefined, currentDark);
          }
        }
      }

      // Phân biệt chính xác giữa kéo xoay (drag/rotate) và nhấp chọn cơ (click)
      let pointerStartX = 0;
      let pointerStartY = 0;
      let pointerStartTime = 0;

      function onPointerDown(event: PointerEvent) {
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        pointerStartTime = performance.now();
      }

      function onPointerUp(event: PointerEvent) {
        const dist = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
        const duration = performance.now() - pointerStartTime;
        // Nếu chuột di chuyển quá 5px hoặc giữ chuột lâu hơn 400ms -> người dùng đang kéo xoay OrbitControls
        if (dist > 5 || duration > 400) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const allMeshes: any[] = [];
        muscleMeshesRef.current.forEach(meshes => allMeshes.push(...meshes));

        const intersects = raycaster.intersectObjects(allMeshes, true);
        if (intersects.length > 0) {
          const muscleId = intersects[0].object.userData?.muscleId;
          if (muscleId) {
            onSelectRef.current?.(muscleId);
          }
        }
      }

      const dom = renderer.domElement;
      dom.addEventListener('pointermove', onPointerMove);
      dom.addEventListener('pointerdown', onPointerDown);
      dom.addEventListener('pointerup', onPointerUp);

      // Animation loop
      function animate() {
        animFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      // Resize handler
      function onResize() {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        dom.removeEventListener('pointermove', onPointerMove);
        dom.removeEventListener('pointerdown', onPointerDown);
        dom.removeEventListener('pointerup', onPointerUp);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        renderer.dispose();
      };
    } catch (err) {
      console.error('Lỗi khi dựng Three.js scene:', err);
    }
  }, [loading]);

  // 3. Cập nhật màu sắc khi activeId thay đổi
  React.useEffect(() => {
    const isDark = checkIsDark();
    isDarkRef.current = isDark;
    updateMeshVisuals(activeId, hoveredMeshRef.current?.userData?.muscleId, isDark);
  }, [activeId]);

  // 4. Lắng nghe thay đổi theme Sáng / Tối để đổi màu vật liệu và ánh sáng ngay lập tức
  React.useEffect(() => {
    function handleThemeChange() {
      const isDark = checkIsDark();
      isDarkRef.current = isDark;
      applyTheme(isDark);
    }

    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'class') {
          handleThemeChange();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Hàm áp dụng theme cho ánh sáng và vật liệu 3D
  function applyTheme(isDark: boolean) {
    if (ambientLightRef.current) {
      ambientLightRef.current.color.setHex(isDark ? 0x1e2436 : 0xe2e8f0);
      ambientLightRef.current.intensity = isDark ? 0.95 : 0.5;
    }
    if (dirLight1Ref.current) {
      dirLight1Ref.current.color.setHex(0xffffff);
      dirLight1Ref.current.intensity = isDark ? 1.1 : 0.65;
    }
    if (dirLight2Ref.current) {
      dirLight2Ref.current.color.setHex(isDark ? 0x38bdf8 : 0x94a3b8);
      dirLight2Ref.current.intensity = isDark ? 0.35 : 0.25;
    }
    if (rimLightRef.current) {
      rimLightRef.current.color.setHex(isDark ? 0x6366f1 : 0x818cf8);
      rimLightRef.current.intensity = isDark ? 1.4 : 0.4;
    }
    if (neutralMatRef.current) {
      neutralMatRef.current.color.setHex(isDark ? 0x161a26 : 0x475569);
      neutralMatRef.current.roughness = isDark ? 0.55 : 0.75;
      neutralMatRef.current.metalness = isDark ? 0.2 : 0.08;
    }
    if (shadowPlaneRef.current) {
      shadowPlaneRef.current.material.opacity = isDark ? 0.35 : 0.16;
    }
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = isDark ? 1.0 : 0.88;
    }
    updateMeshVisuals(activeIdRef.current, hoveredMeshRef.current?.userData?.muscleId, isDark);
  }

  // 5. Cập nhật auto-rotate
  React.useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
      controlsRef.current.autoRotateSpeed = 2.0;
    }
  }, [autoRotate]);

  // Hàm chuyển góc nhìn camera
  function setCameraAngle(view: 'front' | 'back' | 'side') {
    setCurrentView(view);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (view === 'front') {
      camera.position.set(0, 1.2, 3.8);
    } else if (view === 'back') {
      camera.position.set(0, 1.2, -3.8);
    } else if (view === 'side') {
      camera.position.set(3.8, 1.2, 0);
    }
    controls.target.set(0, 1.0, 0);
    controls.update();
  }

  // Cập nhật shader/material màu nhóm cơ
  function updateMeshVisuals(selectedId?: string, hoveredId?: string, isDark?: boolean) {
    const THREE = window.THREE;
    if (!THREE) return;
    const dark = typeof isDark === 'boolean' ? isDark : isDarkRef.current;

    muscleMeshesRef.current.forEach((meshes, mId) => {
      const isSelected = selectedId === mId;
      const isHovered = hoveredId === mId;

      meshes.forEach(mesh => {
        if (isSelected) {
          // Nhóm cơ Active: Tím Indigo đậm phát sáng
          mesh.material.color.setHex(0x4f46e5);
          mesh.material.emissive.setHex(0x6366f1);
          mesh.material.emissiveIntensity = dark ? 0.7 : 0.45;
          mesh.material.roughness = 0.25;
        } else if (isHovered) {
          // Nhóm cơ Hover: Tím Indigo sáng
          mesh.material.color.setHex(0x6366f1);
          mesh.material.emissive.setHex(0x818cf8);
          mesh.material.emissiveIntensity = dark ? 0.45 : 0.3;
          mesh.material.roughness = 0.3;
        } else {
          // Nhóm cơ Idle:
          // Ở Chế độ Sáng (Light): Dùng Slate-500 (0x64748b) với độ nhám roughness 0.65 để triệt tiêu specular lóa trắng
          // Ở Chế độ Tối (Dark): Dùng Slate đậm (0x242a3b)
          mesh.material.color.setHex(dark ? 0x242a3b : 0x64748b);
          mesh.material.emissive.setHex(dark ? 0x10131d : 0x000000);
          mesh.material.emissiveIntensity = dark ? 0.05 : 0.0;
          mesh.material.roughness = dark ? 0.45 : 0.65;
          mesh.material.metalness = dark ? 0.2 : 0.08;
        }
      });
    });
  }

  // Dựng mô hình giải phẫu 3D người
  function buildHumanFigure(scene: any, THREE: any, isDark: boolean) {
    muscleMeshesRef.current.clear();

    // Vật liệu khung xương / trục trung tính (Head, Neck, Torso Base, Pelvis, Feet)
    const neutralMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x161a26 : 0x475569,
      roughness: isDark ? 0.55 : 0.75,
      metalness: isDark ? 0.2 : 0.08,
    });
    neutralMatRef.current = neutralMat;

    function registerMuscle(id: string, mesh: any) {
      mesh.userData = { muscleId: id };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (!muscleMeshesRef.current.has(id)) {
        muscleMeshesRef.current.set(id, []);
      }
      muscleMeshesRef.current.get(id)!.push(mesh);
    }

    function createMuscleMat() {
      return new THREE.MeshStandardMaterial({
        color: isDark ? 0x242a3b : 0x64748b,
        roughness: isDark ? 0.45 : 0.65,
        metalness: isDark ? 0.2 : 0.08,
      });
    }

    // ── Khung xương / Trục cơ thể (Head & Neck & Joints) ──
    // Head
    const headGeo = new THREE.SphereGeometry(0.16, 24, 24);
    headGeo.scale(0.85, 1.15, 0.95);
    const headMesh = new THREE.Mesh(headGeo, neutralMat);
    headMesh.position.set(0, 1.95, 0);
    scene.add(headMesh);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.12, 16);
    const neckMesh = new THREE.Mesh(neckGeo, neutralMat);
    neckMesh.position.set(0, 1.76, 0);
    scene.add(neckMesh);

    // Torso Base Core
    const torsoBaseGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.45, 16);
    const torsoBaseMesh = new THREE.Mesh(torsoBaseGeo, neutralMat);
    torsoBaseMesh.position.set(0, 1.45, 0);
    scene.add(torsoBaseMesh);

    // Pelvis
    const pelvisGeo = new THREE.CylinderGeometry(0.14, 0.17, 0.2, 16);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, neutralMat);
    pelvisMesh.position.set(0, 1.12, 0);
    scene.add(pelvisMesh);

    // ── 1. CƠ NGỰC (Chest / Pectoralis) ──
    const chestGeoL = new THREE.BoxGeometry(0.14, 0.16, 0.08);
    const chestMeshL = new THREE.Mesh(chestGeoL, createMuscleMat());
    chestMeshL.position.set(-0.09, 1.55, 0.13);
    chestMeshL.rotation.set(-0.1, 0.15, 0);
    registerMuscle('chest', chestMeshL);
    scene.add(chestMeshL);

    const chestMeshR = new THREE.Mesh(chestGeoL, createMuscleMat());
    chestMeshR.position.set(0.09, 1.55, 0.13);
    chestMeshR.rotation.set(-0.1, -0.15, 0);
    registerMuscle('chest', chestMeshR);
    scene.add(chestMeshR);

    // ── 2. CƠ VAI (Shoulders / Deltoids) ──
    const deltGeo = new THREE.SphereGeometry(0.11, 16, 16);
    deltGeo.scale(1.1, 1.3, 1.1);

    const deltMeshL = new THREE.Mesh(deltGeo, createMuscleMat());
    deltMeshL.position.set(-0.29, 1.62, 0.02);
    registerMuscle('shoulders', deltMeshL);
    scene.add(deltMeshL);

    const deltMeshR = new THREE.Mesh(deltGeo, createMuscleMat());
    deltMeshR.position.set(0.29, 1.62, 0.02);
    registerMuscle('shoulders', deltMeshR);
    scene.add(deltMeshR);

    // ── 3. TAY TRƯỚC (Biceps) ──
    const bicepGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.20, 16);

    const bicepMeshL = new THREE.Mesh(bicepGeo, createMuscleMat());
    bicepMeshL.position.set(-0.31, 1.40, 0.04);
    registerMuscle('biceps', bicepMeshL);
    scene.add(bicepMeshL);

    const bicepMeshR = new THREE.Mesh(bicepGeo, createMuscleMat());
    bicepMeshR.position.set(0.31, 1.40, 0.04);
    registerMuscle('biceps', bicepMeshR);
    scene.add(bicepMeshR);

    // ── 4. TAY SAU (Triceps) ──
    const tricepMeshL = new THREE.Mesh(bicepGeo, createMuscleMat());
    tricepMeshL.position.set(-0.31, 1.40, -0.04);
    registerMuscle('triceps', tricepMeshL);
    scene.add(tricepMeshL);

    const tricepMeshR = new THREE.Mesh(bicepGeo, createMuscleMat());
    tricepMeshR.position.set(0.31, 1.40, -0.04);
    registerMuscle('triceps', tricepMeshR);
    scene.add(tricepMeshR);

    // ── 5. CẲNG TAY (Forearms) ──
    const forearmGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.22, 12);
    const forearmL = new THREE.Mesh(forearmGeo, createMuscleMat());
    forearmL.position.set(-0.32, 1.14, 0.02);
    registerMuscle('forearms', forearmL);
    scene.add(forearmL);

    const forearmR = new THREE.Mesh(forearmGeo, createMuscleMat());
    forearmR.position.set(0.32, 1.14, 0.02);
    registerMuscle('forearms', forearmR);
    scene.add(forearmR);

    // ── 6. CƠ BỤNG (Abs / Core) ──
    const absGeo = new THREE.BoxGeometry(0.16, 0.26, 0.06);
    const absMesh = new THREE.Mesh(absGeo, createMuscleMat());
    absMesh.position.set(0, 1.34, 0.12);
    registerMuscle('core', absMesh);
    scene.add(absMesh);

    // ── 7. CƠ XÔ & LƯNG TRÊN (Lats & Upper Back) ──
    const upperBackGeo = new THREE.BoxGeometry(0.28, 0.22, 0.08);
    const upperBackMesh = new THREE.Mesh(upperBackGeo, createMuscleMat());
    upperBackMesh.position.set(0, 1.58, -0.11);
    registerMuscle('upper_back', upperBackMesh);
    scene.add(upperBackMesh);

    const latsGeoL = new THREE.BoxGeometry(0.12, 0.20, 0.07);
    const latsMeshL = new THREE.Mesh(latsGeoL, createMuscleMat());
    latsMeshL.position.set(-0.14, 1.40, -0.09);
    latsMeshL.rotation.set(0, 0, -0.2);
    registerMuscle('lats', latsMeshL);
    scene.add(latsMeshL);

    const latsMeshR = new THREE.Mesh(latsGeoL, createMuscleMat());
    latsMeshR.position.set(0.14, 1.40, -0.09);
    latsMeshR.rotation.set(0, 0, 0.2);
    registerMuscle('lats', latsMeshR);
    scene.add(latsMeshR);

    // ── 8. MÔNG (Glutes) ──
    const gluteGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const gluteL = new THREE.Mesh(gluteGeo, createMuscleMat());
    gluteL.position.set(-0.09, 1.08, -0.10);
    registerMuscle('glutes', gluteL);
    scene.add(gluteL);

    const gluteR = new THREE.Mesh(gluteGeo, createMuscleMat());
    gluteR.position.set(0.09, 1.08, -0.10);
    registerMuscle('glutes', gluteR);
    scene.add(gluteR);

    // ── 9. ĐÙI TRƯỚC (Quadriceps) ──
    const quadGeo = new THREE.CylinderGeometry(0.10, 0.07, 0.38, 16);
    const quadL = new THREE.Mesh(quadGeo, createMuscleMat());
    quadL.position.set(-0.11, 0.78, 0.04);
    registerMuscle('quadriceps', quadL);
    scene.add(quadL);

    const quadR = new THREE.Mesh(quadGeo, createMuscleMat());
    quadR.position.set(0.11, 0.78, 0.04);
    registerMuscle('quadriceps', quadR);
    scene.add(quadR);

    // ── 10. ĐÙI SAU (Hamstrings) ──
    const hamGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.36, 16);
    const hamL = new THREE.Mesh(hamGeo, createMuscleMat());
    hamL.position.set(-0.11, 0.78, -0.05);
    registerMuscle('hamstrings', hamL);
    scene.add(hamL);

    const hamR = new THREE.Mesh(hamGeo, createMuscleMat());
    hamR.position.set(0.11, 0.78, -0.05);
    registerMuscle('hamstrings', hamR);
    scene.add(hamR);

    // ── 11. BẮP CHÂN (Calves) ──
    const calfGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.34, 16);
    const calfL = new THREE.Mesh(calfGeo, createMuscleMat());
    calfL.position.set(-0.11, 0.36, 0.01);
    registerMuscle('calves', calfL);
    scene.add(calfL);

    const calfR = new THREE.Mesh(calfGeo, createMuscleMat());
    calfR.position.set(0.11, 0.36, 0.01);
    registerMuscle('calves', calfR);
    scene.add(calfR);

    // Bàn chân (Feet)
    const footGeo = new THREE.BoxGeometry(0.08, 0.06, 0.16);
    const footL = new THREE.Mesh(footGeo, neutralMat);
    footL.position.set(-0.11, 0.12, 0.05);
    scene.add(footL);

    const footR = new THREE.Mesh(footGeo, neutralMat);
    footR.position.set(0.11, 0.12, 0.05);
    scene.add(footR);

    // ── Bóng đổ tiếp đất mềm mại (Ground Contact Shadow) ──
    const shadowGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: isDark ? 0.35 : 0.16,
      depthWrite: false,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(0, 0.08, 0.04);
    shadowPlaneRef.current = shadowPlane;
    scene.add(shadowPlane);
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden select-none">
      {/* Floating Controls Bar 3D */}
      <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1 rounded-xl border border-border/80 bg-card/90 p-1 shadow-lg shadow-black/5 dark:shadow-black/25 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setCameraAngle('front')}
          className={cn(
            'flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
            currentView === 'front'
              ? 'bg-[#6366f1] text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          Mặt trước
        </button>
        <button
          type="button"
          onClick={() => setCameraAngle('side')}
          className={cn(
            'flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
            currentView === 'side'
              ? 'bg-[#6366f1] text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          Nghiêng
        </button>
        <button
          type="button"
          onClick={() => setCameraAngle('back')}
          className={cn(
            'flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer',
            currentView === 'back'
              ? 'bg-[#6366f1] text-white shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          Mặt sau
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        <button
          type="button"
          onClick={() => setAutoRotate(v => !v)}
          title="Tự động xoay 360°"
          aria-label="Tự động xoay 360 độ"
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg transition-all cursor-pointer',
            autoRotate
              ? 'bg-[#6366f1]/15 text-[#6366f1]'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <RotateCw size={13} className={cn(autoRotate && 'animate-spin')} />
        </button>
      </div>

      {/* Loading Spinner */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-xs z-30">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#6366f1] border-t-transparent" />
          <span className="text-xs font-semibold text-muted-foreground">Đang tải mô hình 3D...</span>
        </div>
      )}

      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="h-full w-full min-h-[460px] lg:min-h-[560px] flex items-center justify-center select-none"
      />
    </div>
  );
}

// Helper tải script động an toàn
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (src.includes('three.min.js') && window.THREE) return resolve();
    if (src.includes('OrbitControls') && window.THREE?.OrbitControls) return resolve();

    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}
