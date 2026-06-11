import * as THREE from 'three';
import { Player } from './engine/Player.js';
import { Map, DUNGEON_GRID } from './engine/Map.js';
import { Projectile, castLightning } from './engine/Spells.js';
import { Enemy } from './engine/Enemy.js';
import { Sound } from './engine/Sound.js';

// Global Error Listener for debugging
window.addEventListener('error', (e) => {
  console.error(e);
  const logEl = document.getElementById('combat-log');
  if (logEl) {
    const entry = document.createElement('div');
    entry.className = 'log-entry log-damage';
    entry.innerText = `> ERR: ${e.message} at ${e.filename}:${e.lineno}`;
    logEl.appendChild(entry);
  }
});

// Override console.error to intercept texture 404s and print them to the screen
const originalConsoleError = console.error;
console.error = function(...args) {
  originalConsoleError.apply(console, args);
  const logEl = document.getElementById('combat-log');
  if (logEl) {
    const entry = document.createElement('div');
    entry.className = 'log-entry log-damage';
    // Format message to keep it clean and short
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    entry.innerText = `> CONSOLE_ERR: ${msg.substring(0, 80)}`;
    logEl.appendChild(entry);
  }
};

// Game State Variables
let scene, camera, renderer;
let player, map;
let enemies = [];
let projectiles = [];
let enemyProjectiles = [];
let particles = [];
let gameState = 'start'; // 'start', 'playing', 'paused', 'dead', 'win'

// Hands chroma-key Data URL cache
const transparentHands = {
  idle: '',
  cast: '',
  heal: ''
};

// Chroma-key helper for hands overlay images
function loadAndChromaKeyImage(url, callback) {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Filter out black/near-black pixels using color distance
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const distance = Math.sqrt(r * r + g * g + b * b);
      if (distance < 50) {
        data[i + 3] = 0; // Set alpha to transparent
      }
    }

    ctx.putImageData(imgData, 0, 0);
    callback(canvas.toDataURL());
  };
  image.src = url;
}

// HTML UI Elements
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const deathScreen = document.getElementById('death-screen');
const winScreen = document.getElementById('win-screen');

const startBtn = document.getElementById('start-btn');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const winRestartBtn = document.getElementById('win-restart-btn');

const prevSpellBtn = document.getElementById('prev-spell-btn');
const nextSpellBtn = document.getElementById('next-spell-btn');
const mageHands = document.getElementById('mage-hands');
const combatLog = document.getElementById('combat-log');

// Clock
const clock = new THREE.Clock();

// Initialize the 3D Engine & Game
function initGame() {
  // 1. Create Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b080a);
  
  // Spooky but playable retro fog
  scene.fog = new THREE.FogExp2(0x0b080a, 0.085);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 30.0);

  // 2. Setup Low-Resolution WebGL Renderer (Retro aesthetic!)
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  
  // Render at a retro 480p resolution (scales up via CSS pixelated filtering)
  const retroWidth = 640;
  const retroHeight = 480;
  renderer.setSize(retroWidth, retroHeight, false);
  
  // Attach canvas to container
  const container = document.getElementById('game-container');
  container.insertBefore(renderer.domElement, container.firstChild);

  // 3. Add ambient dungeon lighting (brighter so watercolor textures are visible)
  const ambientLight = new THREE.AmbientLight(0x403545, 0.85);
  scene.add(ambientLight);

  // Add a player headlight point light so walls directly in front of the player are always illuminated (classic Doom/Daggerfall effect)
  const headlight = new THREE.PointLight(0xfff5e6, 0.7, 5.0);
  headlight.position.set(0, 0, 0); // centered at camera
  camera.add(headlight);
  scene.add(camera); // scene must contain camera for children lights to render

  // 4. Initialize Map & Player
  map = new Map(scene);
  player = new Player(camera, map);

  // 5. Spawn Enemies based on Grid
  spawnEnemies();

  // Pre-process hands images to dynamically remove black backgrounds
  const baseUrl = import.meta.env.BASE_URL;
  loadAndChromaKeyImage(`${baseUrl}assets/hands_idle.png`, (dataUrl) => {
    transparentHands.idle = dataUrl;
    mageHands.src = dataUrl; // set transparent idle hands
  });
  loadAndChromaKeyImage(`${baseUrl}assets/hands_cast.png`, (dataUrl) => {
    transparentHands.cast = dataUrl;
  });
  loadAndChromaKeyImage(`${baseUrl}assets/hands_heal.png`, (dataUrl) => {
    transparentHands.heal = dataUrl;
  });

  // Initialize UI displays
  player.updateHUD();
  player.updateHUDSpell();
  addLog("WELCOME TO THE CRIMSON SANCTUM", "log-system");
  addLog("CLICK SCREEN TO LOCK MOUSE AND PLAY", "log-system");

  // 6. Bind Event Listeners
  setupUIEvents();

  // Start Loop
  clock.getDelta(); // reset clock
  animate();
}

function spawnEnemies() {
  // Clear any existing enemy sprites
  enemies.forEach(e => scene.remove(e.sprite));
  enemies = [];

  const grid = map.grid;
  for (let z = 0; z < grid.length; z++) {
    for (let x = 0; x < grid[0].length; x++) {
      const cell = grid[z][x];
      if (cell === 7) {
        enemies.push(new Enemy(scene, 'skeleton', x, z));
      } else if (cell === 8) {
        enemies.push(new Enemy(scene, 'eye', x, z));
      } else if (cell === 9) {
        enemies.push(new Enemy(scene, 'boss', x, z));
      }
    }
  }
}

// Log Messages Console
export function addLog(text, className = "log-system") {
  const entry = document.createElement('div');
  entry.className = `log-entry ${className}`;
  entry.innerText = `> ${text}`;
  combatLog.appendChild(entry);

  // Scroll to bottom
  combatLog.scrollTop = combatLog.scrollHeight;

  // Keep only latest 6 entries to avoid overlap
  while (combatLog.childNodes.length > 6) {
    combatLog.removeChild(combatLog.firstChild);
  }
}

// Setup Buttons and Pointer Lock Controls
function setupUIEvents() {
  // Click start button
  startBtn.onclick = () => {
    Sound.resume();
    document.body.requestPointerLock();
  };

  resumeBtn.onclick = () => {
    document.body.requestPointerLock();
  };

  restartBtn.onclick = () => {
    resetGame();
  };

  winRestartBtn.onclick = () => {
    resetGame();
  };

  // Spell swap buttons on HUD
  prevSpellBtn.onclick = (e) => {
    e.stopPropagation();
    player.cycleSpell(-1);
  };

  nextSpellBtn.onclick = (e) => {
    e.stopPropagation();
    player.cycleSpell(1);
  };

  // Pointer Lock States
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
      // Game Active
      startScreen.classList.remove('active');
      pauseScreen.classList.remove('active');
      gameState = 'playing';
      Sound.startBGM();
      clock.getDelta(); // reset clock to prevent jump
    } else {
      // Paused / Menu Active
      if (!player.isDead && gameState !== 'win') {
        pauseScreen.classList.add('active');
        gameState = 'paused';
        Sound.stopBGM();
      }
    }
  });

  // Handle spell casting when playing
  window.addEventListener('mousedown', (e) => {
    if (gameState !== 'playing' || player.isDead || e.button !== 0) return;
    
    // Attempt Spell Cast
    castPlayerSpell();
  });
}

function castPlayerSpell() {
  if (player.castCooldown > 0) return;

  const spell = player.spells[player.activeSpellIdx];
  if (player.mana < spell.cost) {
    addLog("NOT ENOUGH MANA!", "log-damage");
    Sound.playHurt(); // buzzer buzz sound
    return;
  }

  // Consume mana & start cooldown
  player.mana -= spell.cost;
  player.castCooldown = 0.4; // 400ms shoot cooldown
  player.updateHUD();

  // Play hands anim
  const baseUrl = import.meta.env.BASE_URL;
  mageHands.src = transparentHands.cast || `${baseUrl}assets/hands_cast.png`;
  mageHands.classList.add('hands-cast-anim');
  
  setTimeout(() => {
    mageHands.classList.remove('hands-cast-anim');
    if (!player.isDead) {
      // Return hands to proper style based on selected spell
      updateMageHandsImage();
    }
  }, 250);

  // Cast mechanics
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const spawnPos = player.position.clone().addScaledVector(direction, 0.4);
  spawnPos.y -= 0.1; // adjust spell origin relative to camera height

  if (spell.name === 'FIREBALL') {
    Sound.playFireball();
    addLog("CAST FIREBALL!", "log-spell");
    projectiles.push(
      new Projectile(scene, spawnPos, direction, 'fireball', 25, 6.5, 0xff5500)
    );
  } 
  else if (spell.name === 'REGENERATE') {
    // Healing spell
    mageHands.src = transparentHands.heal || `${baseUrl}assets/hands_heal.png`;
    player.heal(40);
    addLog("CAST REGENERATE (+40 HP)", "log-heal");
    player.castCooldown = 0.8; // heal animation lock
  } 
  else if (spell.name === 'FROST SHARD') {
    Sound.playFrost();
    addLog("CAST FROST SHARD", "log-spell");
    projectiles.push(
      new Projectile(scene, spawnPos, direction, 'frost', 12, 8.5, 0x00b4d8)
    );
  } 
  else if (spell.name === 'LIGHTNING') {
    addLog("CAST LIGHTNING ZAP", "log-spell");
    castLightning(scene, player, enemies, particles, addLog);
  }
}

// Dynamically sets standard idle hands image
function updateMageHandsImage() {
  const baseUrl = import.meta.env.BASE_URL;
  mageHands.src = transparentHands.idle || `${baseUrl}assets/hands_idle.png`;
}

function resetGame() {
  // Hide overlays
  deathScreen.classList.remove('active');
  winScreen.classList.remove('active');
  pauseScreen.classList.remove('active');

  // Clear scene of old entities
  projectiles.forEach(p => { scene.remove(p.mesh); scene.remove(p.light); });
  enemyProjectiles.forEach(p => { scene.remove(p.mesh); scene.remove(p.light); });
  particles.forEach(p => scene.remove(p.mesh));
  
  projectiles = [];
  enemyProjectiles = [];
  particles = [];

  // Reset player variables
  player.health = 100;
  player.mana = 100;
  player.kills = 0;
  player.hasKey = false;
  player.isDead = false;
  player.activeSpellIdx = 0;
  player.castCooldown = 0;
  player.healTimer = 0;
  player.healAmountLeft = 0;
  
  player.position.set(2.5, 0.6, 2.5);
  player.pitch = 0;
  player.yaw = 0;
  player.updateCameraRotation();
  player.camera.position.copy(player.position);

  // Restore doors
  map.doors.forEach(d => {
    scene.remove(d.mesh);
  });
  map.doors = [];

  // Re-spawn keys
  map.keys.forEach(k => {
    scene.remove(k.mesh);
    scene.remove(k.light);
  });
  map.keys = [];

  // Rebuild map and re-spawn keys/torches/enemies
  map.buildMap();
  spawnEnemies();

  // Reset HUD
  player.updateHUD();
  player.updateHUDSpell();
  updateMageHandsImage();

  addLog("DUNGEON RE-ENTERED. PREPARE SPELLS!", "log-system");

  // Re-lock cursor
  gameState = 'playing';
  Sound.resume();
  document.body.requestPointerLock();
}

// Spawns enemy fireball/poison projectives
function spawnEnemyProjectile(position, direction, type, damage, speed, color) {
  enemyProjectiles.push(
    new Projectile(scene, position, direction, type, damage, speed, color)
  );
}

// Game Rendering & Updates Loop
function animate() {
  requestAnimationFrame(animate);

  let dt = clock.getDelta();
  if (dt > 0.1) dt = 0.1; // cap frame time to prevent physics clipping

  if (gameState === 'playing') {
    // 1. Update Player
    player.update(dt);

    // 2. Update Map Elements (Doors, Keys, Torch flickering)
    map.update(dt, player, addLog);

    // 3. Update Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      
      // Pass the callback to spawn enemy projectiles
      enemy.update(dt, player, map, particles, spawnEnemyProjectile);

      // Clean up fully faded dead enemies
      if (enemy.isDead && enemy.state === 'dead') {
        enemies.splice(i, 1);
      }
    }

    // 4. Update Player Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const proj = projectiles[i];
      proj.update(dt, map, enemies, particles, addLog, player);
      
      if (proj.isDead) {
        projectiles.splice(i, 1);
      }
    }

    // 5. Update Enemy Projectiles
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const proj = enemyProjectiles[i];
      
      // Update with player as the target
      proj.update(dt, map, [player], particles, addLog, player);

      // Check collision with player
      if (!proj.isDead) {
        const distToPlayer = proj.position.distanceTo(player.position);
        if (distToPlayer < 0.4) {
          proj.isDead = true;
          scene.remove(proj.mesh);
          scene.remove(proj.light);
          player.takeDamage(proj.damage);
          enemyProjectiles.splice(i, 1);
        }
      } else {
        enemyProjectiles.splice(i, 1);
      }
    }

    // 6. Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const active = particles[i].update(dt);
      if (!active) {
        particles.splice(i, 1);
      }
    }

    // Check if player died this frame
    if (player.isDead && gameState !== 'dead') {
      gameState = 'dead';
      Sound.stopBGM();
    }
  }

  // Render Frame
  renderer.render(scene, camera);
}

// Window resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // Keep renderer canvas size locked to low resolution, but update aspect ratio if needed
});

// Run Game
initGame();
