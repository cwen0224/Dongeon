import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { Sound } from './Sound.js';

export const DUNGEON_GRID = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 6, 1],
  [1, 0, 0, 0, 1, 0, 7, 0, 0, 1, 0, 8, 0, 0, 0, 1],
  [1, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1],
  [1, 1, 2, 1, 1, 1, 1, 0, 1, 1, 1, 1, 2, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 3, 0, 1, 0, 5, 0, 5, 0, 1, 0, 9, 0, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 0, 1, 2, 1, 0, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 7, 0, 0, 0, 1, 0, 1, 0, 0, 0, 7, 0, 0, 1],
  [1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  [1, 6, 0, 2, 0, 0, 2, 0, 2, 0, 0, 22,0, 4, 0, 1], // 22 is Red Key Door
  [1, 0, 8, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
];

export class Map {
  constructor(scene) {
    this.scene = scene;
    this.grid = DUNGEON_GRID;
    this.width = this.grid[0].length;
    this.height = this.grid.length;
    this.tileSize = 1.0;
    this.wallHeight = 2.0;

    // Entity lists
    this.doors = [];
    this.torches = [];
    this.keys = [];
    this.enemies = [];
    this.exitPortal = null;

    // Load textures
    const baseUrl = import.meta.env.BASE_URL;
    const textureLoader = new THREE.TextureLoader();
    this.wallTex = textureLoader.load(`${baseUrl}assets/wall.png`);
    this.floorTex = textureLoader.load(`${baseUrl}assets/floor.png`);
    this.ceilTex = textureLoader.load(`${baseUrl}assets/ceiling.png`);

    // Configure retro pixel look
    [this.wallTex, this.floorTex, this.ceilTex].forEach(tex => {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
    });

    this.wallTex.repeat.set(1, 2); // vertical stretch
    this.floorTex.repeat.set(this.width, this.height);
    this.ceilTex.repeat.set(this.width, this.height);

    // Create Materials
    this.wallMat = new THREE.MeshLambertMaterial({ map: this.wallTex });
    this.floorMat = new THREE.MeshLambertMaterial({ map: this.floorTex });
    this.ceilMat = new THREE.MeshLambertMaterial({ map: this.ceilTex });

    this.buildMap();
  }

  isWall(x, z) {
    if (x < 0 || x >= this.width || z < 0 || z >= this.height) return true;
    const cell = this.grid[z][x];
    
    // Walls and closed doors act as solid blocks
    if (cell === 1 || cell === 5) return true;
    if (cell === 2 || cell === 22) {
      // Find door object
      const door = this.doors.find(d => d.gridX === x && d.gridZ === z);
      if (door && door.isOpen) return false;
      return true; // door is closed
    }
    return false;
  }

  buildMap() {
    // 1. Build Floor and Ceiling
    const floorGeo = new THREE.PlaneGeometry(this.width, this.height);
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    // Align center of plane with the grid center
    floor.position.set(this.width / 2, 0, this.height / 2);
    this.scene.add(floor);

    const ceilGeo = new THREE.PlaneGeometry(this.width, this.height);
    const ceiling = new THREE.Mesh(ceilGeo, this.ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(this.width / 2, this.wallHeight, this.height / 2);
    this.scene.add(ceiling);

    // 2. Build Walls and Props
    const wallGeo = new THREE.BoxGeometry(this.tileSize, this.wallHeight, this.tileSize);

    for (let z = 0; z < this.height; z++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.grid[z][x];
        const px = x * this.tileSize + this.tileSize / 2;
        const pz = z * this.tileSize + this.tileSize / 2;

        if (cell === 1) {
          // Normal Wall
          const wallMesh = new THREE.Mesh(wallGeo, this.wallMat);
          wallMesh.position.set(px, this.wallHeight / 2, pz);
          this.scene.add(wallMesh);
        } 
        else if (cell === 5) {
          // Column
          const colGeo = new THREE.CylinderGeometry(0.2, 0.2, this.wallHeight, 8);
          const colMesh = new THREE.Mesh(colGeo, this.wallMat);
          colMesh.position.set(px, this.wallHeight / 2, pz);
          this.scene.add(colMesh);
        }
        else if (cell === 2 || cell === 22) {
          // Door
          const isRedDoor = cell === 22;
          const doorGeo = new THREE.BoxGeometry(0.9, this.wallHeight, 0.9);
          // Darker wood material
          const doorMat = new THREE.MeshLambertMaterial({ 
            color: isRedDoor ? 0xd03030 : 0x735e3c,
            map: this.wallTex 
          });
          const doorMesh = new THREE.Mesh(doorGeo, doorMat);
          doorMesh.position.set(px, this.wallHeight / 2, pz);
          this.scene.add(doorMesh);

          this.doors.push({
            mesh: doorMesh,
            gridX: x,
            gridZ: z,
            initialY: this.wallHeight / 2,
            targetY: this.wallHeight / 2,
            currentY: this.wallHeight / 2,
            isOpen: false,
            isRedDoor: isRedDoor,
            wasMessaged: false // lock text helper
          });
        }
        else if (cell === 3) {
          // Red Key pickup
          this.spawnKey(px, pz);
        }
        else if (cell === 6) {
          // Torch
          this.spawnTorch(px, pz);
        }
        else if (cell === 4) {
          // Exit Portal
          this.spawnExitPortal(px, pz);
        }
      }
    }
  }

  spawnKey(x, z) {
    // Floating Key sprite
    const loader = new THREE.TextureLoader();
    const keyTex = loader.load('/src/assets/vite.svg'); // Vite svg works as a placeholder, let's make a shiny gold sphere or sprite
    keyTex.magFilter = THREE.NearestFilter;
    
    // Create a physical shiny key using an golden octahedron (3D retro look!)
    const keyGeo = new THREE.OctahedronGeometry(0.15);
    const keyMat = new THREE.MeshStandardMaterial({ 
      color: 0xffd166, 
      roughness: 0.1, 
      metalness: 0.9,
      emissive: 0x885f00
    });
    const keyMesh = new THREE.Mesh(keyGeo, keyMat);
    keyMesh.position.set(x, 0.5, z);
    this.scene.add(keyMesh);

    // Light glowing from the key
    const keyLight = new THREE.PointLight(0xffd166, 0.6, 2);
    keyLight.position.set(x, 0.5, z);
    this.scene.add(keyLight);

    this.keys.push({
      mesh: keyMesh,
      light: keyLight,
      gridX: Math.floor(x),
      gridZ: Math.floor(z)
    });
  }

  spawnTorch(x, z) {
    // Torch Bracket
    const torchGeo = new THREE.BoxGeometry(0.08, 0.4, 0.08);
    const torchMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const torchMesh = new THREE.Mesh(torchGeo, torchMat);
    torchMesh.position.set(x, 1.2, z);
    this.scene.add(torchMesh);

    // Glowing Orange Flame Light
    const torchLight = new THREE.PointLight(0xffaa44, 1.5, 4);
    torchLight.position.set(x, 1.4, z);
    this.scene.add(torchLight);

    this.torches.push({
      light: torchLight,
      baseIntensity: 1.5,
      flickerTimer: Math.random() * 10
    });
  }

  spawnExitPortal(x, z) {
    // Pulsing magic portal: a flat torus standing vertically
    const portalGeo = new THREE.TorusGeometry(0.4, 0.1, 16, 32);
    const portalMat = new THREE.MeshBasicMaterial({ 
      color: 0x4cc9f0, 
      wireframe: true 
    });
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.set(x, 0.9, z);
    this.scene.add(portalMesh);

    const portalLight = new THREE.PointLight(0x4cc9f0, 2.0, 3);
    portalLight.position.set(x, 0.9, z);
    this.scene.add(portalLight);

    this.exitPortal = {
      mesh: portalMesh,
      light: portalLight,
      gridX: Math.floor(x),
      gridZ: Math.floor(z)
    };
  }

  // Update animated map entities (doors opening, torches flickering)
  update(dt, player, logCallback) {
    // 1. Doors anims based on player distance
    this.doors.forEach(door => {
      const dx = door.gridX * this.tileSize + 0.5;
      const dz = door.gridZ * this.tileSize + 0.5;
      
      const distance = player.position.distanceTo(new THREE.Vector3(dx, player.position.y, dz));
      
      // Open when player is within 1.6 cells
      if (distance < 1.6) {
        if (door.isRedDoor && !player.hasKey) {
          // Locked
          door.targetY = door.initialY;
          if (!door.wasMessaged) {
            logCallback("THIS DOOR REQUIRES THE RED KEY!", "log-damage");
            Sound.playHurt(); // buzzer
            door.wasMessaged = true;
            setTimeout(() => { door.wasMessaged = false; }, 2500);
          }
        } else {
          // Open normal door or red door with key
          if (!door.isOpen) {
            door.isOpen = true;
            if (door.isRedDoor) {
              logCallback("RED KEY USED. DOOR OPENED!", "log-victory");
              Sound.playKey();
            } else {
              Sound.playPickup(); // door whoosh/unlock synth
            }
          }
          door.targetY = door.initialY + 1.8; // slide UP
        }
      } else {
        // Close if player moves away (distance > 2.0 to prevent stutter)
        if (distance > 2.0 && door.isOpen) {
          door.isOpen = false;
          door.targetY = door.initialY;
        }
      }

      // Smoothly animate door mesh
      door.currentY += (door.targetY - door.currentY) * 6 * dt;
      door.mesh.position.y = door.currentY;
    });

    // 2. Torch flickering
    this.torches.forEach(torch => {
      torch.flickerTimer += dt * 12;
      // Synthesize organic flicker
      const flicker = Math.sin(torch.flickerTimer) * 0.15 + Math.cos(torch.flickerTimer * 0.7) * 0.1;
      torch.light.intensity = torch.baseIntensity + flicker;
    });

    // 3. Key spinning and pickup check
    for (let i = this.keys.length - 1; i >= 0; i--) {
      const key = this.keys[i];
      // Spin key
      key.mesh.rotation.y += dt * 2;
      key.mesh.rotation.x = Math.sin(Date.now() * 0.003) * 0.2;
      
      const pGridX = Math.floor(player.position.x);
      const pGridZ = Math.floor(player.position.z);

      if (pGridX === key.gridX && pGridZ === key.gridZ) {
        // Collect key!
        player.hasKey = true;
        Sound.playKey();
        logCallback("ACQUIRED RED KEY!", "log-victory");
        
        // Remove from scene and list
        this.scene.remove(key.mesh);
        this.scene.remove(key.light);
        this.keys.splice(i, 1);
        player.updateHUD();
      }
    }

    // 4. Portal spin & Win check
    if (this.exitPortal) {
      this.exitPortal.mesh.rotation.z += dt * 1.5;
      this.exitPortal.mesh.rotation.y += dt * 0.5;

      const pGridX = Math.floor(player.position.x);
      const pGridZ = Math.floor(player.position.z);

      if (pGridX === this.exitPortal.gridX && pGridZ === this.exitPortal.gridZ) {
        // Player wins!
        player.isDead = true; // stops updates
        document.exitPointerLock();
        document.getElementById('win-kills').innerText = player.kills;
        document.getElementById('win-mana').innerText = Math.round(player.mana);
        document.getElementById('win-screen').classList.add('active');
        Sound.playHeal();
      }
    }
  }
}
