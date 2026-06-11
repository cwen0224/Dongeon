import * as THREE from 'three';
import { Sound } from './Sound.js';

// Particle System for Magic Visuals
export class Particle {
  constructor(scene, position, color, velocity, lifetime, size = 0.05) {
    this.scene = scene;
    this.lifetime = lifetime;
    this.maxLifetime = lifetime;
    this.velocity = velocity;

    const geo = new THREE.OctahedronGeometry(size);
    const mat = new THREE.MeshBasicMaterial({ 
      color: color, 
      transparent: true,
      opacity: 1
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);
  }

  update(dt) {
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.scene.remove(this.mesh);
      return false; // dead
    }

    // Move
    this.mesh.position.addScaledVector(this.velocity, dt);
    
    // Shrink & fade
    const ratio = this.lifetime / this.maxLifetime;
    this.mesh.scale.setScalar(ratio);
    this.mesh.material.opacity = ratio;
    
    return true;
  }
}

export class Projectile {
  constructor(scene, position, direction, type, damage, speed, color) {
    this.scene = scene;
    this.position = position.clone();
    this.direction = direction.clone().normalize();
    this.type = type; // 'fireball' or 'frost'
    this.damage = damage;
    this.speed = speed;
    this.color = color;
    this.isDead = false;

    // Create 3D projectile mesh
    const geo = new THREE.OctahedronGeometry(0.12);
    const mat = new THREE.MeshBasicMaterial({ color: color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);

    // Glowing light
    this.light = new THREE.PointLight(color, 1.5, 3);
    this.light.position.copy(this.position);
    this.scene.add(this.light);

    this.trailTimer = 0;
  }

  update(dt, map, enemies, particles, logCallback, player) {
    if (this.isDead) return;

    // Move forward
    this.position.addScaledVector(this.direction, this.speed * dt);
    this.mesh.position.copy(this.position);
    this.light.position.copy(this.position);

    // Spawn trail particles
    this.trailTimer += dt;
    if (this.trailTimer > 0.03) {
      this.trailTimer = 0;
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      );
      particles.push(new Particle(this.scene, this.position, this.color, velocity, 0.4));
    }

    // Check Wall Collisions
    const gridX = Math.floor(this.position.x);
    const gridZ = Math.floor(this.position.z);
    
    if (map.isWall(gridX, gridZ) || this.position.y <= 0 || this.position.y >= map.wallHeight) {
      this.explode(enemies, particles, logCallback, player);
      return;
    }

    // Check Enemy Collisions
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (enemy.isDead) continue;
      
      const distance = this.position.distanceTo(enemy.position);
      if (distance < 0.45) {
        this.explode(enemies, particles, logCallback, player, enemy);
        return;
      }
    }
  }

  explode(enemies, particles, logCallback, player, hitEnemy = null) {
    this.isDead = true;
    this.scene.remove(this.mesh);
    this.scene.remove(this.light);

    // Visual explosion particles
    const particleCount = this.type === 'fireball' ? 20 : 10;
    for (let i = 0; i < particleCount; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 2.5
      );
      particles.push(
        new Particle(
          this.scene, 
          this.position, 
          this.color, 
          velocity, 
          this.type === 'fireball' ? 0.6 : 0.4,
          this.type === 'fireball' ? 0.08 : 0.05
        )
      );
    }

    if (this.type === 'fireball') {
      Sound.playExplosion();
      
      // Screen shake (briefly tilt camera in main update)
      if (player) {
        player.camera.position.y += 0.05;
      }

      // Fireball does Area of Effect (AoE) damage
      const aoeRadius = 1.6;
      let hitAny = false;
      
      enemies.forEach(enemy => {
        if (enemy.isDead) return;
        const dist = this.position.distanceTo(enemy.position);
        if (dist <= aoeRadius) {
          // Linear damage falloff
          const damageMult = 1.0 - (dist / aoeRadius);
          const finalDmg = Math.round(this.damage * damageMult);
          if (finalDmg > 0) {
            enemy.takeDamage(finalDmg, 'fire', logCallback, player);
            hitAny = true;
          }
        }
      });

      if (!hitEnemy && !hitAny) {
        logCallback("FIREBALL DETONATED", "log-system");
      }
    } 
    else if (this.type === 'frost') {
      Sound.playFrost();
      
      // Direct damage + slow effect
      if (hitEnemy) {
        hitEnemy.takeDamage(this.damage, 'frost', logCallback, player);
        hitEnemy.applySlow(4.0, 0.4); // slow down by 60% for 4 seconds
      }
    }
  }
}

// Spawns immediate lightning bolt
export function castLightning(scene, player, enemies, particles, logCallback) {
  Sound.playLightning();

  // Create lightning flash screen effect
  const flash = document.getElementById('lightning-flash');
  if (flash) {
    flash.classList.remove('flash-active');
    void flash.offsetWidth;
    flash.classList.add('flash-active');
  }

  // Raycast from camera center
  const raycaster = new THREE.Raycaster();
  // We can raycast based on camera direction
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(player.camera.quaternion);
  raycaster.set(player.position, direction);

  // Filter out normal walls
  const wallMeshes = [];
  scene.traverse(child => {
    if (child.isMesh && child.geometry && child.geometry.type === 'BoxGeometry') {
      // It's a wall or door
      wallMeshes.push(child);
    }
  });

  const intersectsWalls = raycaster.intersectObjects(wallMeshes);
  let maxDistance = 15.0; // max range
  let hitPoint = player.position.clone().addScaledVector(direction, maxDistance);

  if (intersectsWalls.length > 0) {
    maxDistance = intersectsWalls[0].distance;
    hitPoint = intersectsWalls[0].point;
  }

  // Check which enemy is hit
  let closestEnemy = null;
  let closestDist = maxDistance;

  enemies.forEach(enemy => {
    if (enemy.isDead) return;
    
    // Raycast check against enemy bounding box/cylinder
    // A simple cylinder ray intersection or bounding sphere
    // We check if the ray passes close enough to the enemy's center
    const enemyPos = enemy.position.clone();
    
    // Project enemy position onto the ray
    const v = enemyPos.clone().sub(player.position);
    const projLength = v.dot(direction);
    
    if (projLength > 0 && projLength < closestDist) {
      const projPoint = player.position.clone().addScaledVector(direction, projLength);
      const perpDist = enemyPos.distanceTo(projPoint);
      
      if (perpDist < 0.45) { // bounding radius
        closestDist = projLength;
        closestEnemy = enemy;
        hitPoint = enemyPos; // snap hit to enemy center
      }
    }
  });

  // Render visible electric bolt mesh
  const distance = player.position.distanceTo(hitPoint);
  const boltGeo = new THREE.CylinderGeometry(0.03, 0.03, distance, 6);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);

  // Position bolt halfway between player and hitpoint, rotated to align
  const halfPos = player.position.clone().add(hitPoint).multiplyScalar(0.5);
  boltMesh.position.copy(halfPos);
  
  // Rotate cylinder to align with direction
  const alignVec = hitPoint.clone().sub(player.position).normalize();
  const upVec = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(upVec, alignVec);
  boltMesh.quaternion.copy(quaternion);
  
  scene.add(boltMesh);

  // Spawn electricity spark particles
  for (let i = 0; i < 8; i++) {
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5
    );
    particles.push(new Particle(scene, hitPoint, 0xffea00, velocity, 0.3, 0.04));
  }

  // Remove bolt mesh after 80ms
  setTimeout(() => {
    scene.remove(boltMesh);
  }, 80);

  if (closestEnemy) {
    closestEnemy.takeDamage(35, 'lightning', logCallback, player); // high damage!
  } else {
    logCallback("LIGHTNING ZAPPED THE WALLS", "log-system");
  }
}
