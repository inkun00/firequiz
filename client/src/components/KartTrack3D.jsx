import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Flag, Flame, Gauge, Radio, Snowflake, Trophy, Timer } from 'lucide-react';
import { DEFAULT_AVATAR, getKartSheet, getKartStraight } from '../data/avatarOptions';

const KART_COLORS = {
  RED: 0xef233c,
  BLUE: 0x2563eb,
  YELLOW: 0xfacc15,
  GREEN: 0x22c55e,
  PURPLE: 0xa855f7,
  ORANGE: 0xf97316,
  CYAN: 0x06b6d4,
  PINK: 0xec4899
};

const LANE_X = [-3.9, -1.35, 1.35, 3.9];
const TRACK_LENGTH = 280;
const SEGMENT_LENGTH = 10;
const BROADCAST_MAX_ADVANCE = 62;
const BROADCAST_SCORE_SCALE = 9000;
const KART_SHEET_COLUMNS = 4;
const KART_SHEET_ROWS = 2;
const kartCanvasCache = new Map();
const avatarCanvasCache = new Map();
const straightImageCache = new Map();
const STRAIGHT_SPRITE_FRAME = 'straight';

function formatRaceTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function hashString(value = '') {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function createTextSprite(text, options = {}) {
  const {
    background = 'rgba(8, 15, 35, .88)',
    color = '#ffffff',
    border = '#facc15',
    width = 512,
    height = 128,
    fontSize = 46
  } = options;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.strokeStyle = border;
  context.lineWidth = 8;
  context.beginPath();
  context.roundRect(7, 7, width - 14, height - 14, 26);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = `900 ${fontSize}px "Noto Sans KR", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.9, 0.98, 1);
  sprite.userData.text = text;
  sprite.userData.dispose = () => {
    texture.dispose();
    material.dispose();
  };
  return sprite;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src}`));
    image.src = src;
  });
}

function makeKartBackgroundTransparent(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  const frameWidth = Math.floor(canvas.width / KART_SHEET_COLUMNS);
  const frameHeight = Math.floor(canvas.height / KART_SHEET_ROWS);
  const framePixelCount = frameWidth * frameHeight;

  for (let frameRow = 0; frameRow < KART_SHEET_ROWS; frameRow += 1) {
    for (let frameColumn = 0; frameColumn < KART_SHEET_COLUMNS; frameColumn += 1) {
      const visited = new Uint8Array(framePixelCount);
      const queue = new Int32Array(framePixelCount);
      let queueStart = 0;
      let queueEnd = 0;
      const enqueue = (localX, localY) => {
        const localIndex = localY * frameWidth + localX;
        if (visited[localIndex]) return;
        visited[localIndex] = 1;
        queue[queueEnd] = localIndex;
        queueEnd += 1;
      };

      for (let x = 0; x < frameWidth; x += 1) {
        enqueue(x, 0);
        enqueue(x, frameHeight - 1);
      }
      for (let y = 1; y < frameHeight - 1; y += 1) {
        enqueue(0, y);
        enqueue(frameWidth - 1, y);
      }

      while (queueStart < queueEnd) {
        const localIndex = queue[queueStart];
        queueStart += 1;
        const localX = localIndex % frameWidth;
        const localY = Math.floor(localIndex / frameWidth);
        const globalX = frameColumn * frameWidth + localX;
        const globalY = frameRow * frameHeight + localY;
        const sourceOffset = (globalY * canvas.width + globalX) * 4;

        const tryVisit = (nextX, nextY) => {
          if (nextX < 0 || nextX >= frameWidth || nextY < 0 || nextY >= frameHeight) return;
          const nextLocalIndex = nextY * frameWidth + nextX;
          if (visited[nextLocalIndex]) return;
          const nextGlobalX = frameColumn * frameWidth + nextX;
          const nextGlobalY = frameRow * frameHeight + nextY;
          const nextOffset = (nextGlobalY * canvas.width + nextGlobalX) * 4;
          const redDelta = data[sourceOffset] - data[nextOffset];
          const greenDelta = data[sourceOffset + 1] - data[nextOffset + 1];
          const blueDelta = data[sourceOffset + 2] - data[nextOffset + 2];
          const colorDistance = redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
          if (colorDistance <= 85) enqueue(nextX, nextY);
        };

        tryVisit(localX - 1, localY);
        tryVisit(localX + 1, localY);
        tryVisit(localX, localY - 1);
        tryVisit(localX, localY + 1);
      }

      for (let localIndex = 0; localIndex < framePixelCount; localIndex += 1) {
        if (!visited[localIndex]) continue;
        const localX = localIndex % frameWidth;
        const localY = Math.floor(localIndex / frameWidth);
        const globalX = frameColumn * frameWidth + localX;
        const globalY = frameRow * frameHeight + localY;
        data[(globalY * canvas.width + globalX) * 4 + 3] = 0;
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function getKartCanvas(src) {
  if (!kartCanvasCache.has(src)) {
    kartCanvasCache.set(src, loadImage(src).then(makeKartBackgroundTransparent));
  }
  return kartCanvasCache.get(src);
}

function getStraightImage(src) {
  if (!straightImageCache.has(src)) straightImageCache.set(src, loadImage(src));
  return straightImageCache.get(src);
}

function getAvatarCanvas(src) {
  if (!avatarCanvasCache.has(src)) {
    avatarCanvasCache.set(src, loadImage(src).then((image) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight * 0.67);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      context.beginPath();
      context.arc(128, 128, 116, 0, Math.PI * 2);
      context.clip();
      context.drawImage(image, sourceX, 0, sourceSize, sourceSize, 12, 12, 232, 232);
      context.globalCompositeOperation = 'source-over';
      context.lineWidth = 12;
      context.strokeStyle = '#fde047';
      context.beginPath();
      context.arc(128, 128, 116, 0, Math.PI * 2);
      context.stroke();
      return canvas;
    }));
  }
  return avatarCanvasCache.get(src);
}

function setKartSpriteFrame(kart, frameIndex) {
  const texture = kart.userData.spriteTexture;
  if (!texture || kart.userData.spriteFrame === frameIndex) return;
  const isStraight = frameIndex === STRAIGHT_SPRITE_FRAME;
  if (kart.userData.kartSprite) kart.userData.kartSprite.visible = !isStraight;
  if (kart.userData.straightSprite) kart.userData.straightSprite.visible = isStraight;
  if (isStraight) {
    kart.userData.spriteFrame = frameIndex;
    return;
  }
  const column = frameIndex % KART_SHEET_COLUMNS;
  const row = Math.floor(frameIndex / KART_SHEET_COLUMNS);
  texture.offset.set(column / KART_SHEET_COLUMNS, (KART_SHEET_ROWS - row - 1) / KART_SHEET_ROWS);
  kart.userData.spriteFrame = frameIndex;
}

async function attachRacerSprites(kart, avatar, modelParts) {
  try {
    const [kartCanvas, straightImage, avatarCanvas] = await Promise.all([
      getKartCanvas(getKartSheet(avatar)),
      getStraightImage(getKartStraight(avatar)),
      getAvatarCanvas(avatar || DEFAULT_AVATAR)
    ]);
    if (kart.userData.disposed) return;

    const kartTexture = new THREE.CanvasTexture(kartCanvas);
    kartTexture.colorSpace = THREE.SRGBColorSpace;
    kartTexture.minFilter = THREE.LinearFilter;
    kartTexture.magFilter = THREE.LinearFilter;
    kartTexture.repeat.set(1 / KART_SHEET_COLUMNS, 1 / KART_SHEET_ROWS);
    const kartMaterial = new THREE.SpriteMaterial({
      map: kartTexture,
      transparent: true,
      alphaTest: 0.04,
      depthWrite: false
    });
    const kartSprite = new THREE.Sprite(kartMaterial);
    kartSprite.position.set(0, 0.72, 0.08);
    kartSprite.scale.set(3.45, 4.6, 1);
    kartSprite.renderOrder = 4;
    kartSprite.visible = false;
    kart.add(kartSprite);

    const straightTexture = new THREE.Texture(straightImage);
    straightTexture.colorSpace = THREE.SRGBColorSpace;
    straightTexture.minFilter = THREE.LinearFilter;
    straightTexture.magFilter = THREE.LinearFilter;
    straightTexture.needsUpdate = true;
    const straightMaterial = new THREE.SpriteMaterial({
      map: straightTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: true
    });
    const straightSprite = new THREE.Sprite(straightMaterial);
    const straightAspect = straightImage.naturalWidth / straightImage.naturalHeight;
    const straightHeight = 2.55;
    straightSprite.position.set(0, 1.1, 0.09);
    straightSprite.scale.set(straightHeight * straightAspect, straightHeight, 1);
    straightSprite.renderOrder = 5;
    kart.add(straightSprite);

    const avatarTexture = new THREE.CanvasTexture(avatarCanvas);
    avatarTexture.colorSpace = THREE.SRGBColorSpace;
    avatarTexture.minFilter = THREE.LinearFilter;
    const avatarMaterial = new THREE.SpriteMaterial({ map: avatarTexture, transparent: true, depthTest: false });
    const avatarSprite = new THREE.Sprite(avatarMaterial);
    avatarSprite.position.set(-0.95, 1.82, 0.12);
    avatarSprite.scale.set(0.82, 0.82, 1);
    avatarSprite.renderOrder = 8;
    kart.add(avatarSprite);

    modelParts.forEach((part) => { part.visible = false; });
    kart.userData.spriteTexture = kartTexture;
    kart.userData.spriteFrame = -1;
    kart.userData.kartSprite = kartSprite;
    kart.userData.straightTexture = straightTexture;
    kart.userData.straightSprite = straightSprite;
    kart.userData.avatarSprite = avatarSprite;
    if (kart.userData.halo) kart.userData.halo.visible = false;
    setKartSpriteFrame(kart, STRAIGHT_SPRITE_FRAME);
  } catch (error) {
    console.error('레이서 스프라이트 생성 실패:', error);
  }
}

function createKart(colorHex, isMine = false, avatar = DEFAULT_AVATAR) {
  const kart = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.28, metalness: 0.32 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.68 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.55 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.84
  });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, 28),
    new THREE.MeshBasicMaterial({ color: 0x020617, transparent: true, opacity: 0.42, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.48, 1);
  shadow.position.y = 0.025;
  kart.add(shadow);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.34, 2.15), bodyMaterial);
  chassis.position.y = 0.44;
  chassis.castShadow = true;
  kart.add(chassis);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.28, 0.82), bodyMaterial);
  nose.position.set(0, 0.67, -0.78);
  nose.rotation.x = -0.08;
  nose.castShadow = true;
  kart.add(nose);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.15, 0.18), trimMaterial);
  bumper.position.set(0, 0.35, -1.1);
  kart.add(bumper);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.56, 0.65), darkMaterial);
  seat.position.set(0, 0.82, 0.28);
  seat.rotation.x = -0.12;
  kart.add(seat);

  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.42, 0.1), glassMaterial);
  windscreen.position.set(0, 0.9, -0.22);
  windscreen.rotation.x = -0.32;
  kart.add(windscreen);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd6a5, roughness: 0.72 })
  );
  head.position.set(0, 1.18, 0.23);
  head.castShadow = true;
  kart.add(head);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    bodyMaterial
  );
  helmet.position.set(0, 1.2, 0.23);
  helmet.castShadow = true;
  kart.add(helmet);

  const wheels = [];
  [[-0.82, -0.68], [0.82, -0.68], [-0.82, 0.7], [0.82, 0.7]].forEach(([x, z]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.25, 16), darkMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.3, z);
    wheel.castShadow = true;
    wheels.push(wheel);
    kart.add(wheel);
  });

  [-0.43, 0.43].forEach((x) => {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.13, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0xfef08a, emissiveIntensity: 2.2 })
    );
    light.position.set(x, 0.62, -1.19);
    kart.add(light);
  });

  const sirenBar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.18), trimMaterial);
  sirenBar.position.set(0, 1.54, 0.2);
  kart.add(sirenBar);
  [-0.2, 0.2].forEach((x, index) => {
    const siren = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.14, 0.2),
      new THREE.MeshStandardMaterial({
        color: index === 0 ? 0xef4444 : 0x2563eb,
        emissive: index === 0 ? 0xef4444 : 0x2563eb,
        emissiveIntensity: 2.5
      })
    );
    siren.position.set(x, 1.58, 0.2);
    siren.userData.isSiren = true;
    siren.userData.phase = index * Math.PI;
    kart.add(siren);
  });

  const exhaustMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const nitro = new THREE.Group();
  [-0.38, 0.38].forEach((x) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.9, 12), exhaustMaterial);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(x, 0.34, 1.48);
    nitro.add(flame);
  });
  nitro.visible = false;
  kart.add(nitro);

  const iceMaterial = new THREE.MeshStandardMaterial({
    color: 0x67e8f9, emissive: 0x0891b2, emissiveIntensity: 0.7,
    transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0.2
  });
  const ice = new THREE.Mesh(new THREE.IcosahedronGeometry(1.18, 1), iceMaterial);
  ice.position.y = 0.72;
  ice.scale.set(1, 0.9, 1.25);
  ice.visible = false;
  kart.add(ice);

  const modelParts = kart.children.filter((part) => ![shadow, nitro, ice].includes(part));

  let halo = null;
  if (isMine) {
    halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.055, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.9 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.08;
    kart.add(halo);
  }

  kart.userData = {
    wheels,
    nitro,
    ice,
    halo,
    isMine,
    disposed: false,
    spriteTexture: null,
    spriteFrame: -1,
    straightTexture: null,
    straightSprite: null
  };
  kart.scale.setScalar(isMine ? 1.04 : 0.92);
  attachRacerSprites(kart, avatar, modelParts);
  return kart;
}

function createTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.23, 1.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x7c3f1d, roughness: 1 })
  );
  trunk.position.y = 0.62;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.25, 9),
    new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.92 })
  );
  crown.position.y = 1.95;
  trunk.castShadow = true;
  crown.castShadow = true;
  group.add(trunk, crown);
  return group;
}

function createTrackSegment(index) {
  const group = new THREE.Group();
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(12.4, 0.12, SEGMENT_LENGTH + 0.08),
    new THREE.MeshStandardMaterial({ color: index % 2 ? 0x26354a : 0x2f4055, roughness: 0.94 })
  );
  road.receiveShadow = true;
  group.add(road);
  [-6.48, 6.48].forEach((x) => {
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.2, SEGMENT_LENGTH + 0.1),
      new THREE.MeshStandardMaterial({ color: index % 2 ? 0xf8fafc : 0xef4444, roughness: 0.72 })
    );
    curb.position.set(x, 0.09, 0);
    curb.receiveShadow = true;
    group.add(curb);
  });
  [-2.75, 0, 2.75].forEach((x) => {
    const dash = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.025, 3.8),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    dash.position.set(x, 0.082, 0);
    group.add(dash);
  });
  return group;
}

function createItemBox(index) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.7, 0.7),
    new THREE.MeshStandardMaterial({
      color: index % 2 ? 0x22d3ee : 0xf472b6,
      emissive: index % 2 ? 0x0891b2 : 0xbe185d,
      emissiveIntensity: 1.45, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.22
    })
  );
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.84, 0.84, 0.84)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  );
  group.add(core, frame);
  group.position.y = 0.82;
  group.userData.phase = index * 0.7;
  return group;
}

function disposeObject(root) {
  if (root.userData) root.userData.disposed = true;
  root.traverse((object) => {
    if (object.userData?.dispose) object.userData.dispose();
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

export default function KartTrack3D({
  myId,
  myAvatar = DEFAULT_AVATAR,
  leaderboard = [],
  isFever = false,
  isFrozen = false,
  isPaused = false,
  mode = 'player',
  racePhase = 'RACING',
  countdown = 3,
  totalQuestions = 25,
  raceTimeSec = null,
  className = ''
}) {
  const mountRef = useRef(null);
  const latestRef = useRef({ myId, myAvatar, leaderboard, isFever, isFrozen, isPaused, mode, racePhase });
  const [webglFailed, setWebglFailed] = useState(false);
  latestRef.current = { myId, myAvatar, leaderboard, isFever, isFrozen, isPaused, mode, racePhase };

  const myPlayer = useMemo(() => (
    leaderboard.find((player) => player.id === myId)
      || { nickname: mode === 'broadcast' ? '선두 레이서' : '나', rank: 1, score: 0, progress: 0 }
  ), [leaderboard, myId, mode]);
  const visibleLeaders = leaderboard.slice(0, 3);
  const speed = racePhase !== 'RACING' || isFrozen || isPaused ? 0 : (isFever || myPlayer.isFever ? 248 : 178);
  const progress = Math.min(totalQuestions, myPlayer.progress || 0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (error) {
      console.error('WebGL renderer initialization failed:', error);
      setWebglFailed(true);
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'block h-full w-full';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x60a5fa);
    const isBroadcast = latestRef.current.mode === 'broadcast';
    scene.fog = new THREE.Fog(0x8bc7ed, isBroadcast ? 72 : 38, isBroadcast ? 210 : 150);
    const camera = new THREE.PerspectiveCamera(isBroadcast ? 52 : 58, 1, 0.1, 400);
    camera.position.set(0, isBroadcast ? 52 : 4.2, isBroadcast ? 27 : 9.6);
    camera.lookAt(0, isBroadcast ? 0 : 0.85, isBroadcast ? -24 : -7.5);

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x365314, 2.1));
    const sun = new THREE.DirectionalLight(0xfff1c7, 3.2);
    sun.position.set(-18, 28, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -12;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 420),
      new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, -105);
    ground.receiveShadow = true;
    scene.add(ground);

    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x2d6a67, roughness: 1, flatShading: true });
    for (let i = 0; i < 13; i += 1) {
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(11 + (i % 3) * 5, 22 + (i % 4) * 5, 5), mountainMaterial);
      mountain.position.set(-72 + i * 12, 8.5, -128 - (i % 3) * 12);
      mountain.rotation.y = i * 0.63;
      scene.add(mountain);
    }
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(9, 36),
      new THREE.MeshBasicMaterial({ color: 0xffe082, fog: false })
    );
    sunDisc.position.set(-42, 27, -112);
    scene.add(sunDisc);

    const trackSegments = [];
    const segmentCount = Math.ceil(TRACK_LENGTH / SEGMENT_LENGTH);
    for (let i = 0; i < segmentCount; i += 1) {
      const segment = createTrackSegment(i);
      segment.position.z = 10 - i * SEGMENT_LENGTH;
      scene.add(segment);
      trackSegments.push(segment);
    }
    const scenery = [];
    for (let i = 0; i < 30; i += 1) {
      const tree = createTree();
      tree.position.set((i % 2 ? 1 : -1) * (9 + (i % 4) * 1.8), 0, 8 - i * 9.4);
      tree.scale.setScalar(0.8 + (i % 3) * 0.16);
      scene.add(tree);
      scenery.push(tree);
    }
    const itemBoxes = [];
    for (let i = 0; i < 10; i += 1) {
      const item = createItemBox(i);
      item.position.x = LANE_X[(i + 1) % LANE_X.length];
      item.position.z = -16 - i * 25;
      scene.add(item);
      itemBoxes.push(item);
    }

    const gantry = new THREE.Group();
    const gantryMaterial = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.48, metalness: 0.4 });
    [-7.4, 7.4].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.4, 0.42), gantryMaterial);
      post.position.set(x, 2.7, 0);
      post.castShadow = true;
      gantry.add(post);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(15.3, 1.15, 0.55), gantryMaterial);
    beam.position.y = 5.2;
    beam.castShadow = true;
    gantry.add(beam);
    const banner = createTextSprite('FIRE CUP 119  •  GO! GO! GO!', {
      background: 'rgba(239, 68, 68, .96)', border: '#fde047', fontSize: 40
    });
    banner.position.set(0, 5.2, 0.32);
    banner.scale.set(8.6, 2.1, 1);
    gantry.add(banner);
    gantry.position.z = -62;
    scene.add(gantry);

    const racerObjects = new Map();
    const clock = new THREE.Clock();
    let animationId = 0;
    let trackTravel = 0;

    const syncRacers = (elapsed) => {
      const current = latestRef.current;
      const source = current.leaderboard.length > 0 ? current.leaderboard : [{
        id: current.myId || 'preview-player', nickname: '나', rank: 1, progress: 0,
        score: 0, carColor: 'RED', avatar: current.myAvatar,
        isFever: current.isFever, isFrozen: current.isFrozen
      }];
      const broadcastHasScore = current.mode === 'broadcast'
        && source.some((player) => Number(player.score) > 0);
      const myIndex = Math.max(0, source.findIndex((player) => player.id === current.myId));
      let racers;
      if (current.mode === 'broadcast') {
        racers = source.slice(0, 30);
      } else {
        const start = Math.max(0, myIndex - 6);
        racers = source.slice(start, Math.min(source.length, myIndex + 1));
        const mine = source.find((player) => player.id === current.myId);
        if (mine && !racers.some((player) => player.id === mine.id)) racers.push(mine);
      }
      const activeIds = new Set(racers.map((player) => player.id));
      racerObjects.forEach((object, id) => {
        if (!activeIds.has(id)) {
          scene.remove(object.group);
          disposeObject(object.group);
          racerObjects.delete(id);
        }
      });

      racers.forEach((player, visibleIndex) => {
        let object = racerObjects.get(player.id);
        const isMine = player.id === current.myId;
        if (!object) {
          const color = KART_COLORS[player.carColor] || Object.values(KART_COLORS)[hashString(player.id) % 8];
          const group = createKart(color, isMine, player.avatar || current.myAvatar);
          const label = createTextSprite(`${player.rank || visibleIndex + 1}위  ${player.nickname}`, {
            border: isMine ? '#facc15' : '#94a3b8',
            background: isMine ? 'rgba(120, 53, 15, .94)' : 'rgba(8, 15, 35, .86)',
            fontSize: 42
          });
          label.position.y = 2.55;
          group.add(label);
          group.position.set(0, 0, current.mode === 'broadcast' ? -10 : 2);
          if (current.mode === 'broadcast') group.scale.setScalar(0.76);
          scene.add(group);
          object = { group, player, label, isMine };
          racerObjects.set(player.id, object);
        }
        const nextLabelText = `${player.rank || visibleIndex + 1}위  ${player.nickname}`;
        if (object.label.userData.text !== nextLabelText) {
          object.group.remove(object.label);
          disposeObject(object.label);
          object.label = createTextSprite(nextLabelText, {
            border: isMine ? '#facc15' : '#94a3b8',
            background: isMine ? 'rgba(120, 53, 15, .94)' : 'rgba(8, 15, 35, .86)',
            fontSize: 42
          });
          object.label.position.y = 2.55;
          object.group.add(object.label);
        }
        object.player = player;
        const raceIsMoving = current.racePhase === 'RACING';
        const lane = LANE_X[hashString(player.id) % LANE_X.length];
        let targetZ;
        if (current.mode === 'broadcast') {
          const rankIndex = Math.max(0, (player.rank || visibleIndex + 1) - 1);
          if (broadcastHasScore) {
            const score = Math.max(0, Number(player.score) || 0);
            const scoreAdvance = BROADCAST_MAX_ADVANCE
              * (1 - Math.exp(-score / BROADCAST_SCORE_SCALE));
            targetZ = 9 - scoreAdvance + Math.min(29, rankIndex) * 0.06;
          } else {
            // 출발 전에는 4열 스타팅 그리드로 정렬합니다.
            targetZ = -5 + Math.floor(rankIndex / LANE_X.length) * 2.35;
          }
        } else if (isMine) {
          targetZ = 2.15;
        } else {
          const mine = source[myIndex] || source[0];
          targetZ = 2.15 - ((mine.rank || myIndex + 1) - (player.rank || visibleIndex + 1)) * 4.25;
          targetZ = THREE.MathUtils.clamp(targetZ, -34, 6.2);
        }
        const targetX = isMine && current.mode !== 'broadcast'
          ? (raceIsMoving ? Math.sin(elapsed * 0.78) * 0.28 : 0)
          : lane + (raceIsMoving ? Math.sin(elapsed * 0.85 + hashString(player.id)) * 0.22 : 0);
        object.group.position.x = THREE.MathUtils.lerp(object.group.position.x, targetX, 0.075);
        object.group.position.z = THREE.MathUtils.lerp(object.group.position.z, targetZ, 0.075);
        object.group.position.y = raceIsMoving ? Math.sin(elapsed * 8.5 + visibleIndex) * 0.025 : 0;
        const targetRotation = raceIsMoving ? Math.sin(elapsed * 0.9 + visibleIndex) * 0.025 : 0;
        object.group.rotation.y = THREE.MathUtils.lerp(object.group.rotation.y, targetRotation, 0.08);
        object.group.userData.wheels.forEach((wheel) => {
          wheel.rotation.x -= raceIsMoving && !(current.isFrozen && isMine) ? 0.28 : 0;
        });
        const fever = Boolean(player.isFever || (isMine && current.isFever));
        const frozen = Boolean(player.isFrozen || (isMine && current.isFrozen));
        if (object.group.userData.spriteTexture) {
          let spriteFrame;
          if (!raceIsMoving || frozen || (isMine && current.isPaused)) {
            spriteFrame = STRAIGHT_SPRITE_FRAME;
          } else if (fever) {
            spriteFrame = 6;
          } else if (object.group.rotation.y < -0.018) {
            spriteFrame = 4;
          } else if (object.group.rotation.y > 0.018) {
            spriteFrame = 5;
          } else {
            spriteFrame = STRAIGHT_SPRITE_FRAME;
          }
          setKartSpriteFrame(object.group, spriteFrame);
        }
        object.group.userData.nitro.visible = raceIsMoving && fever && !frozen;
        object.group.userData.ice.visible = frozen;
        if (fever) {
          object.group.userData.nitro.children.forEach((flame, flameIndex) => {
            flame.scale.y = 0.7 + Math.sin(elapsed * 22 + flameIndex) * 0.28;
          });
        }
        object.group.children.forEach((child) => {
          if (child.userData?.isSiren) {
            child.material.emissiveIntensity = 1.2 + Math.max(0, Math.sin(elapsed * 8 + child.userData.phase)) * 4;
          }
        });
      });
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      const current = latestRef.current;
      const raceIsMoving = current.racePhase === 'RACING';
      const worldSpeed = !raceIsMoving || current.isFrozen || current.isPaused ? 0 : (current.isFever ? 35 : 23);
      trackTravel += worldSpeed * delta;
      trackSegments.forEach((segment) => {
        segment.position.z += worldSpeed * delta;
        if (segment.position.z > 15) segment.position.z -= TRACK_LENGTH;
      });
      scenery.forEach((object) => {
        object.position.z += worldSpeed * delta;
        if (object.position.z > 18) object.position.z -= TRACK_LENGTH;
      });
      itemBoxes.forEach((item, index) => {
        item.position.z += worldSpeed * delta;
        if (item.position.z > 16) {
          item.position.z -= TRACK_LENGTH;
          item.position.x = LANE_X[(index + Math.floor(trackTravel / TRACK_LENGTH)) % LANE_X.length];
        }
        item.rotation.y += delta * 2.8;
        item.rotation.x = Math.sin(elapsed * 1.7 + item.userData.phase) * 0.18;
        item.position.y = 0.82 + Math.sin(elapsed * 2.6 + item.userData.phase) * 0.15;
      });
      if (raceIsMoving) {
        gantry.position.z += worldSpeed * delta;
        if (gantry.position.z > 18) gantry.position.z -= TRACK_LENGTH;
      } else {
        gantry.position.z = current.mode === 'broadcast' ? -42 : -14;
      }

      syncRacers(elapsed);
      const broadcastMode = current.mode === 'broadcast';
      const stopped = current.isFrozen || current.isPaused;
      const sway = stopped ? 0 : Math.sin(elapsed * 0.72) * (current.isFever ? 0.24 : 0.12);
      const bob = stopped ? 0 : Math.sin(elapsed * 7.5) * (current.isFever ? 0.055 : 0.025);
      if (broadcastMode) {
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.05);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 52, 0.05);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, 27, 0.05);
        camera.lookAt(0, 0, -24);
      } else {
        const targetCameraY = current.isFever ? 3.85 : 4.2;
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, sway, 0.04);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCameraY + bob, 0.05);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, current.isFever ? 9.15 : 9.6, 0.04);
        camera.lookAt(sway * 0.4, 0.88, -7.5);
      }
      renderer.render(scene, camera);
    };

    animate();
    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  const containerHeight = mode === 'broadcast' ? 'h-64 md:h-[360px]' : 'h-64 md:h-72';
  return (
    <div className={`relative w-full ${containerHeight} overflow-hidden rounded-3xl border-4 border-yellow-400 bg-slate-950 shadow-[0_0_38px_rgba(250,204,21,0.34)] select-none ${className}`}>
      <div ref={mountRef} className="absolute inset-0" aria-label="실시간 3D 카트 레이스 화면" />
      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900 p-6 text-center text-sm font-bold text-slate-300">
          이 기기에서 3D 그래픽을 시작하지 못했습니다. 브라우저의 하드웨어 가속을 켜주세요.
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-slate-950/90 via-slate-950/30 to-transparent p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-300/80 bg-slate-950/85 px-3 py-1 text-cyan-200 shadow-lg backdrop-blur-md">
            {mode === 'broadcast' ? <Radio className="h-4 w-4 animate-pulse text-red-400" /> : <Gauge className="h-4 w-4" />}
            <span className="font-['Jua'] text-base font-black">{mode === 'broadcast' ? 'TOP VIEW' : speed}</span>
            <span className="text-[10px] font-bold">{mode === 'broadcast' ? '전체 트랙 중계' : 'km/h'}</span>
          </div>
          {Number.isFinite(raceTimeSec) && (
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-lg backdrop-blur-md ${
              raceTimeSec <= 30
                ? 'animate-pulse border-red-300 bg-red-600/90 text-white'
                : 'border-yellow-300/80 bg-slate-950/85 text-yellow-200'
            }`}>
              <Timer className="h-4 w-4" />
              <span className="font-['Jua'] text-sm font-black">{formatRaceTime(raceTimeSec)}</span>
            </div>
          )}
          {(isFever || myPlayer.isFever) && (
            <div className="flex items-center gap-1 rounded-full border border-yellow-200 bg-gradient-to-r from-red-600 to-orange-500 px-2.5 py-1 text-[10px] font-black text-white shadow-lg">
              <Flame className="h-3.5 w-3.5 fill-current" /> NITRO BOOST
            </div>
          )}
          {isFrozen && (
            <div className="flex items-center gap-1 rounded-full border border-cyan-100 bg-cyan-500/90 px-2.5 py-1 text-[10px] font-black text-slate-950">
              <Snowflake className="h-3.5 w-3.5 animate-spin" /> FROZEN
            </div>
          )}
          {isPaused && !isFrozen && (
            <div className="flex items-center gap-1 rounded-full border border-red-200 bg-red-600/90 px-2.5 py-1 text-[10px] font-black text-white">
              <Gauge className="h-3.5 w-3.5" /> ENGINE COOLDOWN
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/80 bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 font-['Jua'] text-xs font-black text-slate-950 shadow-xl">
          <Trophy className="h-3.5 w-3.5" />
          {mode === 'broadcast' ? `선두 ${visibleLeaders[0]?.nickname || '대기 중'}` : `${myPlayer.rank || 1}위`}
        </div>
      </div>

      {mode !== 'broadcast' && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
          <div className="w-36 rounded-2xl border border-white/15 bg-slate-950/78 p-2 shadow-xl backdrop-blur-md">
            <div className="mb-1 flex items-center justify-between text-[9px] font-black text-slate-300">
              <span className="flex items-center gap-1"><Flag className="h-3 w-3 text-yellow-300" /> COURSE</span>
              <span>{progress}/{totalQuestions}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-yellow-300 transition-all duration-500" style={{ width: `${Math.max(2, (progress / totalQuestions) * 100)}%` }} />
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-slate-950/78 px-3 py-2 text-right shadow-xl backdrop-blur-md">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fire Cup 119</div>
            <div className="font-['Jua'] text-sm font-black text-yellow-300">{myPlayer.score?.toLocaleString() || 0} PTS</div>
          </div>
        </div>
      )}

      {mode === 'broadcast' && visibleLeaders.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-2xl border border-white/15 bg-slate-950/80 p-2 shadow-xl backdrop-blur-md">
          {visibleLeaders.map((player, index) => (
            <div key={player.id} className="flex min-w-40 items-center gap-2 px-1 py-0.5 text-[10px] font-bold text-white">
              <span className={`flex h-4 w-4 items-center justify-center rounded ${index === 0 ? 'bg-yellow-300 text-slate-950' : 'bg-slate-700'}`}>{index + 1}</span>
              <span className="max-w-24 flex-1 truncate">{player.nickname}</span>
              <span className="text-cyan-300">Q{player.progress || 0}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_45%,rgba(2,6,23,0.32)_100%)]" />
      {(isFever || myPlayer.isFever) && !isFrozen && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-[linear-gradient(90deg,rgba(249,115,22,.18),transparent_18%,transparent_82%,rgba(249,115,22,.18))]" />
      )}
    </div>
  );
}
