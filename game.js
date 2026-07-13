document.addEventListener('contextmenu', event => event.preventDefault());

// --- ゲームステータス ---
let score = 0; let playerHp = 100; let isDead = false;
let wave = 1; let grenadeCount = 3;

let collectedShards = 0; 
let shardsToCollect = 15; 
let shards = []; 

const scoreDisplay = document.getElementById('score-display');
const waveDisplay = document.getElementById('wave-display');
const grenadeDisplay = document.getElementById('grenade-display');
const weaponNameDisplay = document.getElementById('weapon-name');
const shardDisplay = document.getElementById('shard-display');
const hpBar = document.getElementById('hp-bar');
const damageFlash = document.getElementById('damage-flash');
const crosshair = document.getElementById('crosshair');
const adsDot = document.getElementById('ads-dot');
const chTop = document.getElementById('ch-top'), chBottom = document.getElementById('ch-bottom');
const chLeft = document.getElementById('ch-left'), chRight = document.getElementById('ch-right');
const uiContainer = document.getElementById('ui');
const hpContainer = document.getElementById('hp-container');
const waveUIContainer = document.getElementById('wave-ui');
const shardUIContainer = document.getElementById('shard-ui');

const instructions = document.getElementById('instructions');
const blocker = document.getElementById('blocker');
const githubLink = document.getElementById('github-link');
const externalLink = document.getElementById('external-link');

if (githubLink) {
    githubLink.addEventListener('click', (e) => { e.stopPropagation(); });
}
if (externalLink) {
    externalLink.addEventListener('click', (e) => { e.stopPropagation(); });
}

const slideUI = document.createElement('div');
slideUI.style.position = 'absolute';
slideUI.style.bottom = '60px'; 
slideUI.style.left = '50%';
slideUI.style.transform = 'translateX(-50%)';
slideUI.style.fontSize = '20px';
slideUI.style.fontWeight = 'bold';
slideUI.style.color = '#00ffff';
slideUI.style.textShadow = '0 2px 4px #000';
slideUI.style.zIndex = '10';
slideUI.style.letterSpacing = '1px';
slideUI.innerText = 'SLIDE: READY';
document.body.appendChild(slideUI);

const deathCameraPos = new THREE.Vector3(); const deathLookAt = new THREE.Vector3();

// ★ 武器に「ナイフ(COMBAT KNIFE)」を追加
const weapons = [
    { name: "ASSAULT RIFLE", damage: 1.5, fireRate: 0.1, adsFov: 55, type: 'auto', length: 0.8, color: 0x333333, maxAmmo: 25, ammo: 25 },
    { name: "SNIPER RIFLE", damage: 15.0, fireRate: 1.2, adsFov: 20, type: 'semi', length: 1.3, color: 0x113311, maxAmmo: 5, ammo: 5 },
    { name: "SHOTGUN", damage: 0.8, fireRate: 0.8, adsFov: 65, type: 'shotgun', length: 0.6, color: 0x442222, maxAmmo: 10, ammo: 10 },
    { name: "COMBAT KNIFE", damage: 4.0, fireRate: 0.4, adsFov: 75, type: 'melee', length: 0.5, color: 0x999999, maxAmmo: '∞', ammo: '∞' }
];
let currentWeapon = 0; let lastFireTime = 0;

// ★ UIに無限(∞)の表示を対応
function updateWeaponUI() {
    if (weaponNameDisplay) {
        const w = weapons[currentWeapon];
        if (w.type === 'melee') {
            weaponNameDisplay.innerText = `${w.name} [ ∞ ]`;
            weaponNameDisplay.style.color = '#00ffff';
        } else {
            weaponNameDisplay.innerText = `${w.name} [ ${w.ammo} / ${w.maxAmmo} ]`;
            if (w.ammo <= 0) {
                weaponNameDisplay.style.color = '#ff0000';
            } else {
                weaponNameDisplay.style.color = '#00ffff';
            }
        }
    }
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020101); 
scene.fog = new THREE.FogExp2(0x020101, 0.025); 

const baseFov = 75;
const camera = new THREE.PerspectiveCamera(baseFov, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

const flashlight = new THREE.PointLight(0xffeedd, 1.0, 35); 
flashlight.position.set(0, 0, 0);
camera.add(flashlight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15); scene.add(ambientLight); 
const dirLight = new THREE.DirectionalLight(0xffeedd, 0.1); 
dirLight.position.set(20, 50, 20); dirLight.castShadow = true; scene.add(dirLight);

// --- 当たり判定最適化 ---
const collidableMeshList = []; 
const wallMeshes = [];         
let pathTiles = [];
let crystalTiles = [];

const mapSize = 400; 
const floorMat = new THREE.MeshStandardMaterial({ color: 0x440000, roughness: 1.0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapSize, mapSize), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1.0 });
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(mapSize, mapSize), ceilingMat);
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 10; scene.add(ceiling);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x887788, roughness: 0.8 });

function createBox(x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); 
    
    mesh.updateMatrixWorld();
    const bbox = new THREE.Box3().setFromObject(mesh);
    
    collidableMeshList.push({ mesh: mesh, boundingBox: bbox });
    wallMeshes.push(mesh);
}

const tileSize = 6;
let playerSpawnPos = new THREE.Vector3(0, 2.0, 0);

function generateRandomMap(size, crystalCount) {
    let grid = Array(size).fill().map(() => Array(size).fill('.'));

    for(let i=0; i<size; i++) {
        grid[0][i] = 'W';
        grid[size-1][i] = 'W';
        grid[i][0] = 'W';
        grid[i][size-1] = 'W';
    }

    let px = Math.floor(size/2);
    let py = Math.floor(size/2);

    const spacing = 5;
    for (let y = 3; y < size - 4; y += spacing) {
        for (let x = 3; x < size - 4; x += spacing) {
            if (Math.abs(x - px) <= 4 && Math.abs(y - py) <= 4) continue;

            if (Math.random() < 0.85) {
                let w = (Math.random() < 0.5) ? 2 : 3; 
                let h = (Math.random() < 0.5) ? 2 : 3; 
                
                if (Math.random() < 0.25) {
                    if (Math.random() < 0.5) { w = 4; h = 1; } 
                    else { w = 1; h = 4; } 
                }
                
                for (let dy = 0; dy < h; dy++) {
                    for (let dx = 0; dx < w; dx++) {
                        if(y+dy < size-1 && x+dx < size-1) {
                            grid[y + dy][x + dx] = 'W';
                        }
                    }
                }
            }
        }
    }

    grid[py][px] = 'P';

    let emptyCells = [];
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (grid[y][x] === '.') {
                emptyCells.push({x, y});
            }
        }
    }

    emptyCells.sort(() => Math.random() - 0.5);
    let actualCrystalCount = Math.min(crystalCount, emptyCells.length);
    for(let i=0; i<actualCrystalCount; i++){
        let cell = emptyCells[i];
        grid[cell.y][cell.x] = 'C';
    }

    return grid.map(row => row.join(''));
}

function buildMap(waveNum) {
    for (let i = 0; i < collidableMeshList.length; i++) {
        scene.remove(collidableMeshList[i].mesh);
        collidableMeshList[i].mesh.geometry.dispose();
    }
    collidableMeshList.length = 0;
    wallMeshes.length = 0;
    pathTiles.length = 0;
    crystalTiles.length = 0;

    let currentMapSize = 25 + Math.floor(waveNum * 2.0); 
    if (currentMapSize > 45) currentMapSize = 45; 
    
    let targetCrystals = 15 + (waveNum * 5); 
    const layout = generateRandomMap(currentMapSize, targetCrystals);

    const mapWidth = layout[0].length * tileSize;
    const mapDepth = layout.length * tileSize;
    const offsetX = -mapWidth / 2 + tileSize / 2;
    const offsetZ = -mapDepth / 2 + tileSize / 2;

    for (let z = 0; z < layout.length; z++) {
        for (let x = 0; x < layout[z].length; x++) {
            const px = offsetX + x * tileSize;
            const pz = offsetZ + z * tileSize;
            const tile = layout[z][x];

            if (tile === 'W') {
                createBox(px, 5, pz, tileSize, 10, tileSize);
            } else if (tile === '.' || tile === 'P' || tile === 'C') {
                pathTiles.push(new THREE.Vector3(px, 1.0, pz));
                if (tile === 'C') {
                    crystalTiles.push(new THREE.Vector3(px, 1.0, pz));
                }
                if (tile === 'P') {
                    playerSpawnPos.set(px, 2.0, pz);
                }
            }
        }
    }
    
    shardsToCollect = crystalTiles.length; 
    collectedShards = 0;
    
    if (controls && controls.getObject()) {
        controls.getObject().position.copy(playerSpawnPos);
    }
}

// --- プレイヤー・コントロール ---
const controls = new THREE.PointerLockControls(camera, document.body);

controls.addEventListener('lock', () => { if (blocker) blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { if(!isDead && blocker) blocker.style.display = 'flex'; });

if (blocker) {
    blocker.addEventListener('click', () => { if(!isDead) controls.lock(); });
}

buildMap(1);
controls.getObject().position.copy(playerSpawnPos);
updateWeaponUI();

const weaponGroup = new THREE.Group();
const gunGeo = new THREE.BoxGeometry(0.06, 0.12, weapons[0].length);
const gunMat = new THREE.MeshStandardMaterial({ color: weapons[0].color, metalness: 0.8 });
const gunMesh = new THREE.Mesh(gunGeo, gunMat);
const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.05, -weapons[0].length / 2); gunMesh.add(muzzle);

const armGeo = new THREE.BoxGeometry(0.1, 0.1, 0.4);
const armMat = new THREE.MeshStandardMaterial({ color: 0xaa8877 });
const armMesh = new THREE.Mesh(armGeo, armMat); armMesh.position.set(0, -0.1, 0.2);

// ★ ナイフ専用の見た目（グリップ＋ガード＋先端が尖ったブレード）
const knifeGroup = new THREE.Group();
const knifeBladeMat = new THREE.MeshStandardMaterial({ color: 0xd9d9de, metalness: 0.9, roughness: 0.15 });
const knifeHandleMat = new THREE.MeshStandardMaterial({ color: 0x2b2320, metalness: 0.1, roughness: 0.8 });
const knifeGuardMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3 });

const knifeHandle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.22), knifeHandleMat);
knifeHandle.position.set(0, 0, 0.11);
const knifeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.025, 0.03), knifeGuardMat);
knifeGuard.position.set(0, 0, -0.005);
const knifeBladeBody = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.13, 0.4), knifeBladeMat);
knifeBladeBody.position.set(0, 0, -0.21);
const knifeTip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 4), knifeBladeMat);
knifeTip.rotation.x = -Math.PI / 2;
knifeTip.position.set(0, 0, -0.49);
knifeGroup.add(knifeHandle, knifeGuard, knifeBladeBody, knifeTip);
knifeGroup.visible = false;

weaponGroup.add(gunMesh); weaponGroup.add(armMesh); weaponGroup.add(knifeGroup);
const hipFirePos = new THREE.Vector3(0.2, -0.2, -0.4); const adsPos = new THREE.Vector3(0, -0.12, -0.25);
weaponGroup.position.copy(hipFirePos); camera.add(weaponGroup);

document.addEventListener('keydown', (e) => {
    if(isDead) return;
    if(e.code === 'Digit1') switchWeapon(0);
    if(e.code === 'Digit2') switchWeapon(1);
    if(e.code === 'Digit3') switchWeapon(2);
    if(e.code === 'Digit4') switchWeapon(3); // ★ ナイフを「4」キーに割り当て
    if(e.code === 'KeyG') throwGrenade();
});

function switchWeapon(index) {
    currentWeapon = index; 
    updateWeaponUI(); 
    isADS = false; // ★ 武器切り替え時はADS状態をリセット（ナイフに構えたまま等を防止）

    const isMelee = weapons[index].type === 'melee';
    knifeGroup.visible = isMelee;
    gunMesh.visible = !isMelee;
    if (!isMelee) {
        gunMesh.geometry.dispose(); gunMesh.geometry = new THREE.BoxGeometry(0.06, 0.12, weapons[index].length);
        gunMesh.material.color.setHex(weapons[index].color);
        muzzle.position.set(0, 0.05, -weapons[index].length / 2);
    }
}


let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isADS = false, isFiring = false;
let isSliding = false; let slideTimer = 0; let slideCooldown = 0; let canJump = true;
const velocity = new THREE.Vector3(); const direction = new THREE.Vector3();

const baseSpeed = 140.0; const gravity = 60.0;

document.addEventListener('keydown', (e) => {
    if(isDead) return;
    if(e.code==='KeyW') moveForward=true; if(e.code==='KeyA') moveLeft=true;
    if(e.code==='KeyS') moveBackward=true; if(e.code==='KeyD') moveRight=true;
    
    if(e.code==='ShiftLeft' || e.code==='ShiftRight') {
        if(canJump && !isSliding && slideCooldown <= 0 && Math.hypot(velocity.x, velocity.z) > 5) {
            isSliding = true; 
            slideTimer = 0.5; 
            slideCooldown = 9.0; 
            
            velocity.x = -direction.x * 70; 
            velocity.z = -direction.z * 70;
        }
    }
    if(e.code==='Space' && canJump) { velocity.y = 20.0; canJump = false; }
});

document.addEventListener('keyup', (e) => {
    if(e.code==='KeyW') moveForward=false; if(e.code==='KeyA') moveLeft=false;
    if(e.code==='KeyS') moveBackward=false; if(e.code==='KeyD') moveRight=false;
});
document.addEventListener('mousedown', (e) => {
    if(isDead) return;
    if(e.button === 2 && weapons[currentWeapon].type !== 'melee') isADS = true; // ★ ナイフ装備中はADS不可に
    if(e.button === 0) isFiring = true;
});
document.addEventListener('mouseup', (e) => {
    if(e.button === 2) isADS = false; if(e.button === 0) isFiring = false;
});

const shardGeo = new THREE.OctahedronGeometry(0.5);
const shardMat = new THREE.MeshStandardMaterial({ color: 0xdd00ff, emissive: 0xaa00dd, roughness: 0.1, metalness: 0.8 });

function spawnShards(count, positions = pathTiles) {
    const sourcePositions = (positions.length > 0 ? positions : pathTiles);
    if (sourcePositions.length === 0 || count <= 0) return;
    const spawnCount = Math.min(count, sourcePositions.length);

    for (let i = 0; i < spawnCount; i++) {
        const spawnPos = sourcePositions[i];
        const shard = new THREE.Mesh(shardGeo, shardMat);
        shard.position.set(spawnPos.x, 1.0, spawnPos.z);
        scene.add(shard); shards.push(shard);
    }
    if (shardDisplay) shardDisplay.innerText = `${collectedShards} / ${shardsToCollect}`;
}

spawnShards(shardsToCollect, crystalTiles);

let grenades = []; let explosions = [];
const grenadeGeo = new THREE.SphereGeometry(0.15); const grenadeMat = new THREE.MeshStandardMaterial({color: 0x2e7d32});

const monkeyFurMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); 
const monkeySuitMat = new THREE.MeshStandardMaterial({ color: 0xaa0000 }); 
const monkeyEyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); 

function throwGrenade() {
    if (grenadeCount <= 0 || isDead) return;
    grenadeCount--; if (grenadeDisplay) grenadeDisplay.innerText = `GRENADES [G]: ${grenadeCount}`;
    const greMesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    const startPos = new THREE.Vector3(); muzzle.getWorldPosition(startPos);
    greMesh.position.copy(startPos); scene.add(greMesh);
    const throwDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); throwDir.y += 0.2; 
    grenades.push({ mesh: greMesh, velocity: throwDir.multiplyScalar(20), life: 2.0 }); 
}

function triggerExplosion(pos) {
    const expMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), new THREE.MeshBasicMaterial({color: 0xffaa00, transparent: true, opacity: 0.8}));
    expMesh.position.copy(pos); scene.add(expMesh);
    explosions.push({ mesh: expMesh, scale: 1.0, life: 0.3 });

    for(let i=bots.length-1; i>=0; i--) {
        const bot = bots[i];
        if(!bot.isDead && bot.hitbox.position.distanceTo(pos) < 10.0) { 
            damageBot(bot, 30); 
        }
    }
    if (controls.getObject().position.distanceTo(pos) < 8.0) {
        playerHp -= 50; updateHpUI();
        if (playerHp <= 0) triggerPlayerDeath(null);
    }
}

function createTracer(startPoint, endPoint) {
    const material = new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.8 });
    const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
    const line = new THREE.Line(geometry, material); scene.add(line);
    setTimeout(() => { scene.remove(line); geometry.dispose(); material.dispose(); }, 40);
}

const raycaster = new THREE.Raycaster(); let bots = [];

function damageBot(bot, damage) {
    if (bot.isDead) return;
    bot.hp -= damage;
    if(bot.hpFg) bot.hpFg.scale.x = Math.max(0, bot.hp / bot.maxHp);
    
    bot.visual.children.forEach(c => { 
        if(c.type === 'Mesh' || c.type === 'Group') {
            if(c.material) {
                if (c.userData.originalColor === undefined) {
                    c.userData.originalColor = c.material.color.getHex();
                }
                c.material.color.setHex(0xff0000);
            }
        }
    });

    setTimeout(() => { 
        if (bot && !bot.isDead) {
            bot.visual.children.forEach(c => {
                if(c.material && c.userData.originalColor !== undefined) {
                    c.material.color.setHex(c.userData.originalColor);
                }
            });
        } else if (bot && bot.isDead) {
            bot.visual.children.forEach(c => {
                if(c.material) c.material.color.setHex(0x220000); 
            });
        }
    }, 100);

    if (bot.hp <= 0) {
        bot.isDead = true; 
        score++; if (scoreDisplay) scoreDisplay.innerText = score;
        
        bot.hitbox.rotation.x = -Math.PI / 2;
        bot.hitbox.position.y = 0.6 * bot.scale; 
        
        setTimeout(() => {
            scene.remove(bot.hitbox);
            const idx = bots.indexOf(bot);
            if (idx > -1) bots.splice(idx, 1);
            
            if (bots.length < 2) {
                spawnBot(false);
            }
        }, 3000);
    }
}

function fireBullet(time, currentSpeed) {
    const w = weapons[currentWeapon]; 
    if (time - lastFireTime < w.fireRate) return;

    if (w.type !== 'melee' && w.ammo <= 0) {
        if(w.type === 'semi' || w.type === 'shotgun') isFiring = false;
        return; 
    }

    lastFireTime = time;
    if (w.type !== 'melee') {
        w.ammo--; 
        updateWeaponUI(); 
    }

    // ★ ナイフの近接攻撃処理
    if (w.type === 'melee') {
        weaponGroup.position.z -= 0.3; // 腕を前に突き出すアニメーション
        weaponGroup.rotation.y = -0.5; // 少し傾けて刺す
        setTimeout(() => { weaponGroup.rotation.y = 0; }, 150);

        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        raycaster.set(camera.position, shootDir);
        const hitTargets = [...bots.map(b => b.hitbox), ...wallMeshes];
        const intersects = raycaster.intersectObjects(hitTargets);

        // ★ 射程距離を制限（3.0以内ならヒット・少し短縮）
        if (intersects.length > 0 && intersects[0].distance <= 3.0) { 
            const hitObject = intersects[0].object;
            const botIndex = bots.findIndex(b => b.hitbox === hitObject);
            if (botIndex > -1) {
                damageBot(bots[botIndex], w.damage);
            }
        }
        isFiring = false; // 1回クリックで1回振る仕様
        return;
    }

    weaponGroup.position.z += 0.08; weaponGroup.rotation.x += isADS ? 0.01 : 0.05;
    const shots = w.type === 'shotgun' ? 10 : 1;
    const muzzlePos = new THREE.Vector3(); muzzle.getWorldPosition(muzzlePos);

    for(let i=0; i<shots; i++) {
        const shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        let spread = (currentSpeed > 1.0 && !isSliding) ? (isADS ? 0.15 : 0.3) : (isADS ? 0.0 : 0.01);
        if (w.type === 'shotgun') spread += 0.15;

        if (spread > 0) {
            shootDir.x += (Math.random() - 0.5) * spread; shootDir.y += (Math.random() - 0.5) * spread; shootDir.z += (Math.random() - 0.5) * spread;
            shootDir.normalize();
        }

        raycaster.set(camera.position, shootDir);
        const hitTargets = [...bots.map(b => b.hitbox), ...wallMeshes];
        const intersects = raycaster.intersectObjects(hitTargets);

        let hitPoint = new THREE.Vector3();
        if (intersects.length > 0) {
            hitPoint = intersects[0].point; const hitObject = intersects[0].object;
            const botIndex = bots.findIndex(b => b.hitbox === hitObject);
            
            if (botIndex > -1) {
                damageBot(bots[botIndex], w.damage);
            }
        } else { hitPoint.copy(muzzlePos).add(shootDir.multiplyScalar(100)); }
        createTracer(muzzlePos, hitPoint);
    }
    if(w.type === 'semi' || w.type === 'shotgun') isFiring = false;
}

const bladeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1.0, roughness: 0.2 });

function spawnBot(isBoss = false) {
    if (pathTiles.length === 0) return;
    
    let spawnPoint = pathTiles[0];
    let attempts = 0; 
    do {
        spawnPoint = pathTiles[Math.floor(Math.random() * pathTiles.length)];
        attempts++;
        if (attempts > 50) break; 
    } while (Math.hypot(spawnPoint.x - camera.position.x, spawnPoint.z - camera.position.z) < 40);

    const scale = isBoss ? 2.0 : 1.0;
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 3.4 * scale, 1.2 * scale), new THREE.MeshBasicMaterial({ visible: false }));
    hitbox.position.set(spawnPoint.x, 1.7 * scale, spawnPoint.z);
    
    const botHeadMat = monkeyFurMat.clone();
    const botBodyMat = monkeySuitMat.clone();
    const botLegMat = monkeyFurMat.clone();

    const visual = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8*scale, 0.7*scale, 0.8*scale), botHeadMat); 
    head.position.y = 1.4*scale;
    
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.2*scale, 0.15*scale, 0.1*scale), monkeyEyeMat);
    eyeL.position.set(-0.2*scale, 0.1*scale, 0.41*scale);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.2*scale, 0.15*scale, 0.1*scale), monkeyEyeMat);
    eyeR.position.set(0.2*scale, 0.1*scale, 0.41*scale);
    head.add(eyeL, eyeR);

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2*scale, 1.4*scale, 0.6*scale), botBodyMat); 
    body.position.y = 0.4*scale;

    const bladeL = new THREE.Mesh(new THREE.BoxGeometry(0.1*scale, 1.5*scale, 0.3*scale), bladeMat);
    bladeL.position.set(-0.8*scale, 0.4*scale, 0.5*scale);
    bladeL.rotation.x = Math.PI / 4;
    const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.1*scale, 1.5*scale, 0.3*scale), bladeMat);
    bladeR.position.set(0.8*scale, 0.4*scale, 0.5*scale);
    bladeR.rotation.x = Math.PI / 4;
    body.add(bladeL, bladeR);

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.4*scale, 1.4*scale, 0.4*scale), botLegMat); legL.position.set(-0.3*scale, -0.7*scale, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.4*scale, 1.4*scale, 0.4*scale), botLegMat); legR.position.set(0.3*scale, -0.7*scale, 0);
    
    visual.add(head, body, legL, legR);

    const maxHp = isBoss ? 80 : 8 + (wave * 1.5);
    const hpGroup = new THREE.Group(); hpGroup.position.y = 2.2 * scale; 
    const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(1.5 * scale, 0.2 * scale), new THREE.MeshBasicMaterial({color: 0xff0000}));
    const fgGeo = new THREE.PlaneGeometry(1.5 * scale, 0.2 * scale); fgGeo.translate(0.75 * scale, 0, 0); 
    const hpFg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({color: 0x00ff00})); hpFg.position.set(-0.75 * scale, 0, 0.01);
    hpGroup.add(hpBg, hpFg); visual.add(hpGroup);

    hitbox.add(visual); scene.add(hitbox);
    
    bots.push({ 
        hitbox: hitbox, visual: visual, maxHp: maxHp, hp: maxHp, hpGroup: hpGroup, hpFg: hpFg,
        speedMult: isBoss ? 0.8 : 1.0, 
        isBoss: isBoss, scale: scale,
        lastAttack: 0, targetX: spawnPoint.x, targetZ: spawnPoint.z, walkTime: 0,
        isDead: false 
    });
}

for (let i = 0; i < 2; i++) spawnBot(false); 

// ★ 修正：HPが回復したときにバーの色が緑に戻る処理を追加
function updateHpUI() {
    if (hpBar) {
        hpBar.style.width = Math.max(0, playerHp) + '%';
        if (playerHp <= 30) {
            hpBar.style.backgroundColor = 'red';
        } else {
            hpBar.style.backgroundColor = '#00ff00';
        }
    }
    if (damageFlash) {
        damageFlash.style.opacity = '0.5';
        setTimeout(() => { if (damageFlash) damageFlash.style.opacity = '0'; }, 100);
    }
}

function triggerPlayerDeath(killer) {
    if(isDead) return;
    isDead = true; controls.unlock();
    const pos = controls.getObject().position.clone();

    if (crosshair) crosshair.style.display = 'none';
    if (adsDot) adsDot.style.display = 'none';
    if (uiContainer) uiContainer.style.display = 'none';
    if (hpContainer) hpContainer.style.display = 'none';
    if (waveUIContainer) waveUIContainer.style.display = 'none';
    if (shardUIContainer) shardUIContainer.style.display = 'none';
    if (slideUI) slideUI.style.display = 'none';
    
    weaponGroup.visible = false;
    const mmEl = document.getElementById('minimap'); if (mmEl) mmEl.style.display = 'none';

    const worldPos = new THREE.Vector3(); camera.getWorldPosition(worldPos);
    scene.add(camera); camera.position.copy(worldPos);
    
    const playerCorpse = new THREE.Group();
    const pShirtMat = new THREE.MeshStandardMaterial({ color: 0x0055aa });
    const pSkinMat = new THREE.MeshStandardMaterial({ color: 0xccaa99 });
    const pPantsMat = new THREE.MeshStandardMaterial({ color: 0x111122 });

    const pHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), pSkinMat);
    pHead.position.set(0, 1.2, 0);
    const pTorso = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.5), pShirtMat);
    pTorso.position.set(0, 0.3, 0);
    const pLegs = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), pPantsMat);
    pLegs.position.set(0, -0.9, 0);

    playerCorpse.add(pHead, pTorso, pLegs);
    playerCorpse.position.copy(pos);
    playerCorpse.position.y = 0.3; 
    playerCorpse.rotation.x = -Math.PI / 2; 
    playerCorpse.rotation.z = Math.random() * Math.PI * 2; 
    scene.add(playerCorpse);

    if (killer && killer.hitbox) {
        const killerPos = killer.hitbox.position.clone();
        let dirToPlayer = new THREE.Vector3().subVectors(pos, killerPos);
        dirToPlayer.y = 0; 
        
        if (dirToPlayer.lengthSq() < 0.1) {
            dirToPlayer.set(0, 0, 1);
        } else {
            dirToPlayer.normalize();
        }
        
        deathCameraPos.copy(pos).add(dirToPlayer.multiplyScalar(6.0));
        deathCameraPos.y = pos.y + 4.0;
        
        deathLookAt.copy(pos).lerp(killerPos, 0.5);
        deathLookAt.y = pos.y + 1.0;
    } else {
        deathCameraPos.copy(pos).add(new THREE.Vector3(0, 5, 5));
        deathLookAt.copy(pos);
    }

    setTimeout(() => {
        if (blocker) blocker.style.display = 'flex';
        if (instructions) {
            instructions.innerHTML = `<h1>YOU ARE <span>DEAD</span></h1><p>COLLECTED: ${collectedShards} / ${shardsToCollect}</p><p>クリックでリトライ</p>`;
            blocker.addEventListener('click', () => location.reload(), {once: true});
        }
    }, 3000);
}

function drawMinimap() {
    const mm = document.getElementById('minimap');
    if (!mm) return;
    const ctx = mm.getContext('2d');
    ctx.clearRect(0, 0, mm.width, mm.height);
    if (!controls || !controls.getObject()) return;

    const viewRadius = 60;              
    const cx = mm.width / 2, cy = mm.height / 2;
    const scale = cx / viewRadius;
    const cullMargin = tileSize;        

    const pos = controls.getObject().position;
    const px = pos.x, pz = pos.z;
    const toScreenX = (wx) => cx + (wx - px) * scale;
    const toScreenY = (wz) => cy + (wz - pz) * scale;

    ctx.fillStyle = 'rgba(224, 224, 236, 0.85)';
    for (let i = 0; i < collidableMeshList.length; i++) {
        const wall = collidableMeshList[i].mesh;
        const dx = wall.position.x - px, dz = wall.position.z - pz;
        if (Math.abs(dx) > viewRadius + cullMargin || Math.abs(dz) > viewRadius + cullMargin) continue;
        const w = wall.geometry.parameters.width * scale;
        const d = wall.geometry.parameters.depth * scale;
        ctx.fillRect(toScreenX(wall.position.x) - w / 2, toScreenY(wall.position.z) - d / 2, w, d);
    }

    ctx.fillStyle = '#dd00ff';
    for (let i = 0; i < shards.length; i++) {
        const s = shards[i];
        const dx = s.position.x - px, dz = s.position.z - pz;
        if (Math.abs(dx) > viewRadius || Math.abs(dz) > viewRadius) continue;
        ctx.beginPath(); ctx.arc(toScreenX(s.position.x), toScreenY(s.position.z), 3, 0, Math.PI * 2); ctx.fill();
    }

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const angle = Math.atan2(dir.x, -dir.z);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.shadowColor = '#00ffff'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

const clock = new THREE.Clock(); const playerBox = new THREE.Box3(); const grenadeBox = new THREE.Box3();

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.05); 
    const time = clock.getElapsedTime();
    const pos = controls.getObject().position;

    if ((controls.isLocked || isDead)) {
        
        if (!isDead) {
            if (slideCooldown > 0) {
                slideCooldown -= delta;
                if (slideUI) {
                    slideUI.innerText = `SLIDE: COOLDOWN (${slideCooldown.toFixed(1)}s)`;
                    slideUI.style.color = '#ffaa00'; 
                }
            } else {
                slideCooldown = 0;
                if (slideUI) {
                    slideUI.innerText = 'SLIDE: READY';
                    slideUI.style.color = '#00ffff'; 
                }
            }

            camera.fov += ((isADS ? weapons[currentWeapon].adsFov : baseFov) - camera.fov) * 20 * delta;
            camera.updateProjectionMatrix();
            
            // ★ ナイフを振っていない時は元の位置に戻る処理
            weaponGroup.position.lerp(isADS ? adsPos : hipFirePos, 20 * delta); 
            weaponGroup.rotation.x *= 0.8; 

            if (crosshair) crosshair.style.opacity = isADS ? '0' : '1';
            if (adsDot) adsDot.style.display = isADS ? 'block' : 'none';

            velocity.y -= gravity * delta; 

            let friction = 10.0;
            if (isSliding) {
                slideTimer -= delta; if(slideTimer <= 0) isSliding = false;
                friction = 2.0; 
            } else if (!moveForward && !moveBackward && !moveLeft && !moveRight && canJump) {
                friction = 30.0; 
            }
            if(!canJump) friction = 1.0; 

            velocity.x -= velocity.x * friction * delta; velocity.z -= velocity.z * friction * delta;
            direction.z = Number(moveForward) - Number(moveBackward); direction.x = Number(moveRight) - Number(moveLeft); direction.normalize();

            let speedMulti = 1.0;
            if (isADS) speedMulti *= 0.5; 
            let accelRate = baseSpeed * speedMulti;

            if (!canJump) accelRate *= 0.05; 
            if (isSliding) accelRate = 0;    

            if (moveForward || moveBackward) velocity.z -= direction.z * accelRate * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * accelRate * delta;

            const currentSpeed = Math.hypot(velocity.x, velocity.z);
            if(isFiring) fireBullet(time, currentSpeed);

            if (currentSpeed > 1.0 && !isSliding) {
                if (chTop) chTop.style.transform = 'translateY(-15px)'; if (chBottom) chBottom.style.transform = 'translateY(15px)';
                if (chLeft) chLeft.style.transform = 'translateX(-15px)'; if (chRight) chRight.style.transform = 'translateX(15px)';
            } else {
                if (chTop) chTop.style.transform = 'translateY(0px)'; if (chBottom) chBottom.style.transform = 'translateY(0px)';
                if (chLeft) chLeft.style.transform = 'translateX(0px)'; if (chRight) chRight.style.transform = 'translateX(0px)';
            }

            const playerHeight = isSliding ? 1.0 : 2.0;
            const collisionSize = new THREE.Vector3(1.6, playerHeight, 1.6); 

            const targetX = -velocity.x * delta;
            const targetZ = -velocity.z * delta;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            forward.y = 0; forward.normalize();
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            right.y = 0; right.normalize();

            const moveVector = new THREE.Vector3()
                .addScaledVector(forward, targetZ)
                .addScaledVector(right, targetX);
            const steps = Math.max(1, Math.ceil(moveVector.length() / 0.2));
            const stepVector = moveVector.clone().multiplyScalar(1 / steps);

            for (let i = 0; i < steps; i++) {
                const prevPos = pos.clone();
                pos.add(stepVector);
                playerBox.setFromCenterAndSize(new THREE.Vector3(pos.x, pos.y - playerHeight / 2, pos.z), collisionSize);
                
                if (collidableMeshList.some(w => playerBox.intersectsBox(w.boundingBox))) {
                    pos.copy(prevPos);

                    const stepX = new THREE.Vector3(stepVector.x, 0, 0);
                    const stepZ = new THREE.Vector3(0, 0, stepVector.z);

                    let moved = false;
                    if (Math.abs(stepX.x) > 0.0001) {
                        const prevPosX = pos.clone();
                        pos.add(stepX);
                        playerBox.setFromCenterAndSize(new THREE.Vector3(pos.x, pos.y - playerHeight / 2, pos.z), collisionSize);
                        if (!collidableMeshList.some(w => playerBox.intersectsBox(w.boundingBox))) {
                            moved = true;
                            velocity.z = 0;
                        } else {
                            pos.copy(prevPosX);
                        }
                    }

                    if (Math.abs(stepZ.z) > 0.0001) {
                        const prevPosZ = pos.clone();
                        pos.add(stepZ);
                        playerBox.setFromCenterAndSize(new THREE.Vector3(pos.x, pos.y - playerHeight / 2, pos.z), collisionSize);
                        if (!collidableMeshList.some(w => playerBox.intersectsBox(w.boundingBox))) {
                            moved = true;
                            velocity.x = 0;
                        } else {
                            pos.copy(prevPosZ);
                        }
                    }

                    if (!moved) {
                        velocity.x = 0; velocity.z = 0;
                        break;
                    }
                }
            }

            pos.y += velocity.y * delta;
            const expectedFloorY = playerHeight;
            if (pos.y <= expectedFloorY) { pos.y = expectedFloorY; velocity.y = 0; canJump = true; }

            for(let i=shards.length-1; i>=0; i--) {
                let s = shards[i];
                s.rotation.y += 2 * delta; s.position.y = 1.0 + Math.sin(time * 3 + i) * 0.2; 
                
                if (s.position.distanceTo(new THREE.Vector3(pos.x, 1.0, pos.z)) < 2.0) {
                    scene.remove(s); shards.splice(i, 1);
                    collectedShards++; if (shardDisplay) shardDisplay.innerText = `${collectedShards} / ${shardsToCollect}`;
                    
                    if (collectedShards >= shardsToCollect) {
                        
                        // ★ 追加：3ウェーブクリアごとのリソース回復処理
                        if (wave % 3 === 0) {
                            weapons.forEach(w => {
                                if (w.type !== 'melee') w.ammo = w.maxAmmo;
                            });
                            grenadeCount = 3; 
                            playerHp = Math.min(100, playerHp + 40); 
                            updateWeaponUI();
                            updateHpUI();
                        }

                        wave++; 
                        
                        for(let j = shards.length - 1; j >= 0; j--) { scene.remove(shards[j]); }
                        shards.length = 0;
                        
                        buildMap(wave);
                        velocity.set(0, 0, 0); 
                        
                        for(let j = bots.length - 1; j >= 0; j--) { scene.remove(bots[j].hitbox); }
                        bots.length = 0;
                        for (let j = 0; j < 2; j++) spawnBot(false);

                        if (shardDisplay) shardDisplay.innerText = `${collectedShards} / ${shardsToCollect}`;
                        if (waveDisplay) waveDisplay.innerText = `WAVE ${wave}`;
                        if (grenadeDisplay) grenadeDisplay.innerText = `GRENADES [G]: ${grenadeCount}`;
                        
                        spawnShards(shardsToCollect, crystalTiles);
                    }
                }
            }

        } else {
            camera.position.lerp(deathCameraPos, 3 * delta); 
            const targetRot = new THREE.Quaternion().setFromRotationMatrix(
                new THREE.Matrix4().lookAt(camera.position, deathLookAt, new THREE.Vector3(0, 1, 0))
            );
            camera.quaternion.slerp(targetRot, 3 * delta);
        }

        // ★ 修正：グレネード/爆発の更新処理が丸ごと抜けていたため復元
        // throwGrenade()でgrenades配列に積まれるだけで、寿命を減らして起爆する処理が
        // animate()内のどこにも無かったため、投げても永遠に爆発しなかった。
        for (let i = grenades.length - 1; i >= 0; i--) {
            let g = grenades[i];
            g.velocity.y -= gravity / 2 * delta;

            const geSize = new THREE.Vector3(0.3, 0.3, 0.3);
            const nextX = g.mesh.position.x + g.velocity.x * delta;
            grenadeBox.setFromCenterAndSize(new THREE.Vector3(nextX, g.mesh.position.y, g.mesh.position.z), geSize);
            if (collidableMeshList.some(w => grenadeBox.intersectsBox(w.boundingBox))) {
                g.velocity.x *= -0.5; 
            } else {
                g.mesh.position.x = nextX;
            }

            const nextZ = g.mesh.position.z + g.velocity.z * delta;
            grenadeBox.setFromCenterAndSize(new THREE.Vector3(g.mesh.position.x, g.mesh.position.y, nextZ), geSize);
            if (collidableMeshList.some(w => grenadeBox.intersectsBox(w.boundingBox))) {
                g.velocity.z *= -0.5; 
            } else {
                g.mesh.position.z = nextZ;
            }

            g.mesh.position.y += g.velocity.y * delta;
            g.life -= delta;
            if (g.mesh.position.y < 0.2) {
                g.mesh.position.y = 0.2;
                g.velocity.y *= -0.5; g.velocity.x *= 0.8; g.velocity.z *= 0.8;
            }
            if (g.life <= 0) {
                triggerExplosion(g.mesh.position);
                scene.remove(g.mesh);
                grenades.splice(i, 1);
            }
        }

        for (let i = explosions.length - 1; i >= 0; i--) {
            let e = explosions[i];
            e.scale += 30 * delta;
            e.mesh.scale.set(e.scale, e.scale, e.scale);
            e.life -= delta;
            e.mesh.material.opacity = e.life * 2.5;
            if (e.life <= 0) {
                scene.remove(e.mesh);
                explosions.splice(i, 1);
            }
        }

        bots.forEach((bot) => {
            if (bot.isDead) return; 

            const distToPlayer = bot.hitbox.position.distanceTo(pos);
            const sightPos = new THREE.Vector3(bot.hitbox.position.x, bot.hitbox.position.y + 0.5*bot.scale, bot.hitbox.position.z);
            const dirToPlayer = new THREE.Vector3().subVectors(pos, sightPos).normalize();
            
            const botRay = new THREE.Raycaster(sightPos, dirToPlayer);
            const botIntersects = botRay.intersectObjects(wallMeshes);
            let canSeePlayer = (!isDead && (botIntersects.length === 0 || botIntersects[0].distance > distToPlayer));

            let moveSpeed = 0;
            let moveVec = new THREE.Vector3();

            if (!isDead) {
                bot.hitbox.lookAt(pos.x, bot.hitbox.position.y, pos.z);
                bot.targetX = pos.x; bot.targetZ = pos.z; 
                
                if (distToPlayer < 2.5 * bot.scale) {
                    moveSpeed = 0;
                    if (time - bot.lastAttack > 1.0) { 
                        playerHp -= bot.isBoss ? 40 : 20; 
                        updateHpUI(); bot.lastAttack = time;
                        if (playerHp <= 0) triggerPlayerDeath(bot);
                    }
                } else {
                    moveSpeed = 11.5 * bot.speedMult; 
                    moveVec.copy(dirToPlayer).multiplyScalar(moveSpeed * delta);
                }
            } else {
                moveSpeed = 0;
            }

            if (moveVec.lengthSq() > 0) {
                const eBoxSize = new THREE.Vector3(1.5 * bot.scale, 3.4 * bot.scale, 1.5 * bot.scale);
                const steps = Math.max(1, Math.ceil(moveVec.length() / 0.5));
                const stepVec = moveVec.clone().divideScalar(steps);

                for(let s=0; s<steps; s++) {
                    const prevEx = bot.hitbox.position.x;
                    bot.hitbox.position.x += stepVec.x;
                    playerBox.setFromCenterAndSize(bot.hitbox.position, eBoxSize);
                    
                    if (collidableMeshList.some(w => playerBox.intersectsBox(w.boundingBox))) {
                        bot.hitbox.position.x = prevEx;
                    }

                    const prevEz = bot.hitbox.position.z;
                    bot.hitbox.position.z += stepVec.z;
                    playerBox.setFromCenterAndSize(bot.hitbox.position, eBoxSize);
                    if (collidableMeshList.some(w => playerBox.intersectsBox(w.boundingBox))) {
                        bot.hitbox.position.z = prevEz;
                    }
                }
            }

            bot.walkTime += moveSpeed * delta * 5;
            const legL = bot.visual.children[2]; const legR = bot.visual.children[3];
            if (moveSpeed > 0) {
                legL.position.z = Math.sin(bot.walkTime) * 0.5 * bot.scale; legR.position.z = -Math.sin(bot.walkTime) * 0.5 * bot.scale;
            } else { legL.position.z = 0; legR.position.z = 0; }

            bot.hpGroup.quaternion.copy(camera.quaternion);
        });

        drawMinimap();
    }
    renderer.render(scene, camera);
}

animate();