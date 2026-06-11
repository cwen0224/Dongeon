import * as THREE from 'three';
import { Sound } from './Sound.js';
import { Particle } from './Spells.js';

// Helper to convert black backgrounds to transparent PNGs in-browser
export function loadChromaKeyTexture(url, colorKey = { r: 15, g: 15, b: 15 }) {
  const texture = new THREE.Texture();
  const image = new Image();
  
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    // Filter out black/near-black pixels
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      if (r <= colorKey.r && g <= colorKey.g && b <= colorKey.b) {
        data[i + 3] = 0; // Set alpha to transparent
      }
    }

    ctx.putImageData(imgData, 0, 0);
    
    // Assign canvas to Three.js texture
    texture.image = canvas;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
  };
  
  image.src = url;
  return texture;
}

export class Enemy {
  constructor(scene, type, x, z) {
    this.scene = scene;
    this.type = type; // 'skeleton', 'eye', 'boss'
    this.isDead = false;

    // Grid Coordinates & Position
    this.position = new THREE.Vector3(x + 0.5, 0.5, z + 0.5);
    
    // Properties based on enemy type
    this.setupStats();

    // Sprite Material & Mesh
    this.texture = loadChromaKeyTexture(this.spriteUrl);
    const mat = new THREE.SpriteMaterial({ 
      map: this.texture,
      color: 0xffffff,
      fog: true
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.position.copy(this.position);
    this.sprite.scale.set(this.width, this.height, 1.0);
    this.scene.add(this.sprite);

    // AI States: 'idle', 'chase', 'attack', 'hurt', 'die'
    this.state = 'idle';
    this.actionTimer = 0;
    this.slowTimer = 0;
    this.speedMultiplier = 1.0;
    
    // Floating behavior for floating eye
    if (this.type === 'eye') {
      this.position.y = 0.75;
      this.sprite.position.y = 0.75;
    }
  }

  setupStats() {
    if (this.type === 'skeleton') {
      this.spriteUrl = 'assets/skeleton.png';
      this.maxHealth = 45;
      this.health = 45;
      this.speed = 1.6;
      this.attackRange = 1.1; // melee
      this.attackCooldown = 1.5;
      this.damage = 12;
      this.width = 0.8;
      this.height = 1.3;
      this.scoreValue = 100;
    } 
    else if (this.type === 'eye') {
      this.spriteUrl = 'assets/eye.png';
      this.maxHealth = 35;
      this.health = 35;
      this.speed = 1.1;
      this.attackRange = 6.0; // ranged
      this.attackCooldown = 2.2;
      this.damage = 10;
      this.width = 0.8;
      this.height = 0.9;
      this.scoreValue = 150;
    } 
    else if (this.type === 'boss') {
      this.spriteUrl = 'assets/boss.png';
      this.maxHealth = 200;
      this.health = 200;
      this.speed = 1.3;
      this.attackRange = 7.0; // long range
      this.attackCooldown = 1.2;
      this.damage = 16;
      this.width = 1.6;
      this.height = 2.4;
      this.scoreValue = 1000;
    }
  }

  takeDamage(amount, damageType, logCallback, player) {
    if (this.isDead) return;

    this.health = Math.max(0, this.health - amount);
    Sound.playMonsterHurt();
    
    const dmgColor = damageType === 'fire' ? '🔥' : damageType === 'frost' ? '❄️' : '⚡';
    logCallback(`HIT ${this.type.toUpperCase()} FOR ${amount} DAMAGE ${dmgColor}`, 'log-spell');

    // Retro Hit Flash effect: make sprite green/red briefly
    this.sprite.material.color.setHex(0xff5555);
    setTimeout(() => {
      if (!this.isDead) {
        this.sprite.material.color.setHex(0xffffff);
      }
    }, 150);

    // AI Reaction
    if (this.state === 'idle') {
      this.state = 'chase';
    }

    if (this.health <= 0) {
      this.die(logCallback, player);
    } else {
      // Small recoil pushback
      this.state = 'hurt';
      this.actionTimer = 0.25; // stun for 0.25s
    }
  }

  applySlow(duration, multiplier) {
    this.slowTimer = duration;
    this.speedMultiplier = multiplier;
    this.sprite.material.color.setHex(0x5599ff); // blue tint for frost
  }

  die(logCallback, player) {
    this.isDead = true;
    this.state = 'die';
    this.sprite.material.color.setHex(0x331111);
    Sound.playMonsterDie();
    
    player.kills += 1;
    logCallback(`SLAIN ${this.type.toUpperCase()}! (+${this.scoreValue})`, 'log-victory');

    // Spawn massive burst of watercolor blood/dust particles
    const particleColor = this.type === 'boss' ? 0xff0000 : 0xaa2222;
    for (let i = 0; i < 25; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 2.0,
        (Math.random() - 0.5) * 1.5
      );
      // Spawn slightly above floor
      const spawnPos = this.position.clone();
      spawnPos.y += 0.3;
      // Add particles
      // We will push them to the global particle array inside the main game loop
    }
  }

  update(dt, player, map, particles, spawnEnemyProjectileCallback) {
    if (this.isDead) {
      if (this.state === 'die') {
        // Fall to the floor animation (tilt sideways and slide down)
        this.sprite.rotation.z += (Math.PI / 2 - this.sprite.rotation.z) * 6 * dt;
        this.position.y += (0.02 - this.position.y) * 4 * dt;
        this.sprite.position.copy(this.position);

        // Fade out
        this.sprite.material.opacity = Math.max(0, this.sprite.material.opacity - dt);
        if (this.sprite.material.opacity <= 0) {
          this.scene.remove(this.sprite);
          this.state = 'dead';
        }
      }
      return;
    }

    // Handle Slow Timer
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.speedMultiplier = 1.0;
        this.sprite.material.color.setHex(0xffffff); // clear frost tint
      }
    }

    // AI Logic State Machine
    const distToPlayer = this.position.distanceTo(player.position);

    // 1. Idle -> Chase transition
    if (this.state === 'idle') {
      // Wake up if player is close (within 8 cells)
      if (distToPlayer < 8.0) {
        this.state = 'chase';
        Sound.playMonsterHurt(); // awake sound
      }
      return;
    }

    // 2. Hurt recovery
    if (this.state === 'hurt') {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        this.state = 'chase';
      }
      // Push back slightly away from player
      const pushDir = this.position.clone().sub(player.position).setY(0).normalize();
      this.position.addScaledVector(pushDir, 1.2 * dt);
      this.sprite.position.copy(this.position);
      return;
    }

    // Cooldown attacks
    if (this.actionTimer > 0) {
      this.actionTimer -= dt;
    }

    // 3. Chase State
    if (this.state === 'chase') {
      // Walk bobbing animation
      this.sprite.rotation.z = Math.sin(Date.now() * 0.012) * 0.12;

      // Check if in attack range
      if (distToPlayer <= this.attackRange) {
        this.attackPlayer(player, spawnEnemyProjectileCallback);
      } else {
        // Move towards player X and Z
        const moveDir = player.position.clone().sub(this.position);
        moveDir.y = 0;
        moveDir.normalize();

        const currentSpeed = this.speed * this.speedMultiplier * dt;
        
        // Grid-based collision checks for sliding movement
        const nextX = this.position.x + moveDir.x * currentSpeed;
        const nextZ = this.position.z + moveDir.z * currentSpeed;

        const gridX = Math.floor(nextX);
        const gridZ = Math.floor(nextZ);
        const curGridX = Math.floor(this.position.x);
        const curGridZ = Math.floor(this.position.z);

        // Slide along X
        if (!map.isWall(gridX, curGridZ)) {
          this.position.x = nextX;
        }
        // Slide along Z
        if (!map.isWall(curGridX, gridZ)) {
          this.position.z = nextZ;
        }

        // Apply visual position
        this.sprite.position.copy(this.position);
      }
    }
  }

  attackPlayer(player, spawnEnemyProjectileCallback) {
    if (this.actionTimer > 0) return; // on cooldown
    this.actionTimer = this.attackCooldown;

    // Melee swing or Ranged projectile
    if (this.type === 'skeleton') {
      // Melee swing: lunge forward animation
      const lungeDir = player.position.clone().sub(this.position).setY(0).normalize();
      this.sprite.position.addScaledVector(lungeDir, 0.25);
      
      setTimeout(() => {
        if (!this.isDead) this.sprite.position.copy(this.position);
      }, 150);

      // Hit check
      player.takeDamage(this.damage);
    } 
    else if (this.type === 'eye') {
      // Shoot glowing purple poison orb!
      const startPos = this.position.clone();
      startPos.y += 0.1; // shoot from center of eye
      
      const dir = player.position.clone().sub(startPos).normalize();
      
      spawnEnemyProjectileCallback(startPos, dir, 'poison', this.damage, 4.0, 0xbd00ff);
      Sound.playFrost();
    } 
    else if (this.type === 'boss') {
      // Boss fires direct fireball projectiles!
      const startPos = this.position.clone();
      startPos.y += 0.5;
      const dir = player.position.clone().sub(startPos).normalize();

      spawnEnemyProjectileCallback(startPos, dir, 'fireball', this.damage, 5.0, 0xff5500);
      Sound.playFireball();
    }
  }
}
