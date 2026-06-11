import * as THREE from 'three';
import { Sound } from './Sound.js';

export class Player {
  constructor(camera, map) {
    this.camera = camera;
    this.map = map;

    // Player Stats
    this.maxHealth = 100;
    this.health = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.manaRegenRate = 8; // mana per second
    
    // Spells Setup
    this.spells = [
      { name: 'FIREBALL', cost: 15, key: '1', class: 'fireball-icon' },
      { name: 'REGENERATE', cost: 25, key: '2', class: 'heal-icon' },
      { name: 'FROST SHARD', cost: 10, key: '3', class: 'frost-icon' },
      { name: 'LIGHTNING', cost: 30, key: '4', class: 'lightning-icon' }
    ];
    this.activeSpellIdx = 0;
    this.castCooldown = 0; // cooldown in seconds
    
    // Position & Movement
    this.position = new THREE.Vector3(2.5, 0.6, 2.5); // starting grid position (grid cell [2,2] center)
    this.camera.position.copy(this.position);
    
    this.velocity = new THREE.Vector3();
    this.speed = 4.0; // units per second
    this.radius = 0.28; // collision radius
    this.height = 0.6;
    
    // Rotation (Mouse look)
    this.pitch = 0; // vertical rotation
    this.yaw = 0;   // horizontal rotation
    this.mouseSensitivity = 0.0022;
    
    // Keys & Inventory
    this.hasKey = false;
    this.kills = 0;
    this.isDead = false;

    // Movement flags
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false
    };

    // Heal over time state
    this.healTimer = 0;
    this.healAmountLeft = 0;

    // Setup input listeners
    this.initInputs();
  }

  initInputs() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      if (this.isDead) return;

      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') this.keys.w = true;
      if (key === 's' || e.key === 'ArrowDown') this.keys.s = true;
      if (key === 'a' || e.key === 'ArrowLeft') this.keys.a = true;
      if (key === 'd' || e.key === 'ArrowRight') this.keys.d = true;

      // Spell swap keys
      if (key === 'q') this.cycleSpell(-1);
      if (key === 'e') this.cycleSpell(1);

      // Direct spell selections
      if (e.key === '1') this.selectSpell(0);
      if (e.key === '2') this.selectSpell(1);
      if (e.key === '3') this.selectSpell(2);
      if (e.key === '4') this.selectSpell(3);
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') this.keys.w = false;
      if (key === 's' || e.key === 'ArrowDown') this.keys.s = false;
      if (key === 'a' || e.key === 'ArrowLeft') this.keys.a = false;
      if (key === 'd' || e.key === 'ArrowRight') this.keys.d = false;
    });

    // Mouse movement for looking
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== document.body || this.isDead) return;
      
      this.yaw -= e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;
      
      // Clamp vertical look (pitch)
      const limit = Math.PI / 2.2;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
      
      this.updateCameraRotation();
    });

    // Mouse scroll wheel for swapping spells
    window.addEventListener('wheel', (e) => {
      if (this.isDead) return;
      if (e.deltaY > 0) {
        this.cycleSpell(1);
      } else {
        this.cycleSpell(-1);
      }
    });
  }

  updateCameraRotation() {
    // Create Euler rotation matrix
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(euler);
  }

  cycleSpell(dir) {
    this.activeSpellIdx = (this.activeSpellIdx + dir + this.spells.length) % this.spells.length;
    this.updateHUDSpell();
    Sound.playPickup();
  }

  selectSpell(idx) {
    if (idx >= 0 && idx < this.spells.length) {
      this.activeSpellIdx = idx;
      this.updateHUDSpell();
      Sound.playPickup();
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;
    
    this.health = Math.max(0, this.health - amount);
    Sound.playHurt();
    
    // Trigger screen flash red
    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.remove('flash-active');
      void flash.offsetWidth; // trigger reflow
      flash.classList.add('flash-active');
    }

    // React portrait to damage
    const portrait = document.getElementById('portrait');
    if (portrait) {
      portrait.className = 'portrait-hurt';
      setTimeout(() => {
        if (!this.isDead) this.updatePortrait();
      }, 600);
    }
    
    this.updateHUD();

    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.isDead = true;
    Sound.playMonsterDie();
    document.getElementById('portrait').className = 'portrait-dead';
    document.getElementById('death-kills').innerText = this.kills;
    
    // Fade to black and show death screen
    setTimeout(() => {
      document.exitPointerLock();
      document.getElementById('death-screen').classList.add('active');
    }, 1000);
  }

  heal(amount) {
    if (this.isDead) return;
    
    // Trigger heal over time or instant
    this.healAmountLeft += amount;
    this.healTimer = 2.0; // Heal over 2 seconds
    
    Sound.playHeal();
    
    const flash = document.getElementById('heal-flash');
    if (flash) {
      flash.classList.remove('flash-active');
      void flash.offsetWidth; // trigger reflow
      flash.classList.add('flash-active');
    }

    const portrait = document.getElementById('portrait');
    if (portrait) {
      portrait.className = 'portrait-grin';
      setTimeout(() => {
        if (!this.isDead) this.updatePortrait();
      }, 1000);
    }
  }

  updatePortrait() {
    const portrait = document.getElementById('portrait');
    if (!portrait || this.isDead) return;
    
    if (this.health < 30) {
      portrait.className = 'portrait-bloody';
    } else if (this.health < 60) {
      portrait.className = 'portrait-wounded';
    } else {
      portrait.className = 'portrait-normal';
    }
  }

  updateHUD() {
    const hBar = document.getElementById('health-bar');
    const hText = document.getElementById('health-text');
    const mBar = document.getElementById('mana-bar');
    const mText = document.getElementById('mana-text');
    const keyInd = document.getElementById('key-indicator');

    if (hBar) hBar.style.width = `${(this.health / this.maxHealth) * 100}%`;
    if (hText) hText.innerText = `${Math.round(this.health)} / ${this.maxHealth}`;
    if (mBar) mBar.style.width = `${(this.mana / this.maxMana) * 100}%`;
    if (mText) mText.innerText = `${Math.round(this.mana)} / ${this.maxMana}`;
    
    if (keyInd) {
      if (this.hasKey) {
        keyInd.className = 'key-indicator has-key';
        keyInd.innerText = '🔑 RED KEY';
      } else {
        keyInd.className = 'key-indicator no-key';
        keyInd.innerText = '🔑 NONE';
      }
    }
  }

  updateHUDSpell() {
    const spell = this.spells[this.activeSpellIdx];
    const nameEl = document.getElementById('spell-name');
    const costEl = document.getElementById('spell-cost');
    const iconEl = document.getElementById('spell-icon');

    if (nameEl) nameEl.innerText = spell.name;
    if (costEl) costEl.innerText = `Cost: ${spell.cost} MP`;
    if (iconEl) {
      iconEl.className = `spell-icon ${spell.class}`;
    }
  }

  // Update loop for player (movements and stats regeneration)
  update(dt, onCastSpell) {
    if (this.isDead) return;

    // 1. Passive Mana Regen
    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + this.manaRegenRate * dt);
      this.updateHUD();
    }

    // 2. Passive Healing Over Time
    if (this.healTimer > 0 && this.healAmountLeft > 0) {
      const healStep = (this.healAmountLeft / this.healTimer) * dt;
      this.health = Math.min(this.maxHealth, this.health + healStep);
      this.healAmountLeft -= healStep;
      this.healTimer -= dt;
      this.updatePortrait();
      this.updateHUD();
    }

    // 3. Spell Cooldowns
    if (this.castCooldown > 0) {
      this.castCooldown -= dt;
    }

    // 4. Movement Calculation
    this.movePlayer(dt);

    // 5. Check Casting
    // In main game loop, we check for mouse clicks. We pass a callback because spawning 3D objects (fireballs) happens in the scene
  }

  movePlayer(dt) {
    // Vector pointing in look direction but projected onto XZ plane
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    // Sum directions based on key inputs
    const dir = new THREE.Vector3();
    if (this.keys.w) dir.add(forward);
    if (this.keys.s) dir.sub(forward);
    if (this.keys.d) dir.add(right);
    if (this.keys.a) dir.sub(right);

    const isMoving = dir.lengthSq() > 0;
    
    // Hands Bobbing class toggle
    const handsImg = document.getElementById('mage-hands');
    if (handsImg) {
      if (isMoving && document.pointerLockElement === document.body) {
        handsImg.classList.add('hands-bob-walk');
      } else {
        handsImg.classList.remove('hands-bob-walk');
      }
    }

    if (isMoving) {
      dir.normalize();
      
      // Calculate next desired position
      const moveAmount = this.speed * dt;
      const nextX = this.position.x + dir.x * moveAmount;
      const nextZ = this.position.z + dir.z * moveAmount;

      // Sliding collision detection (check X and Z separately!)
      // Collision in X direction
      if (!this.checkWallCollision(nextX, this.position.z)) {
        this.position.x = nextX;
      }
      // Collision in Z direction
      if (!this.checkWallCollision(this.position.x, nextZ)) {
        this.position.z = nextZ;
      }
      
      // Update camera position
      this.camera.position.copy(this.position);
    }
  }

  checkWallCollision(x, z) {
    // Check points around the player's bounding circle
    const angleStep = Math.PI / 4; // Check 8 directions
    for (let i = 0; i < 8; i++) {
      const angle = i * angleStep;
      const checkX = x + Math.cos(angle) * this.radius;
      const checkZ = z + Math.sin(angle) * this.radius;
      
      // Convert 3D position to grid cells
      const gridX = Math.floor(checkX);
      const gridZ = Math.floor(checkZ);
      
      if (this.map.isWall(gridX, gridZ)) {
        return true; // Collision detected
      }
    }
    return false;
  }
}
