// Config file for a lot of things

const wave_settings = {
    // all enemy related info follows this format: [standard, fast, tank]
    total_enemy_counts_per_wave: {
        1:  [1, 0, 0],
        2:  [2, 0, 0],
        3:  [5, 0, 0],
        4:  [1, 2, 0],
        5:  [0, 6, 0],
        6:  [5, 0, 1],
        7:  [8, 2, 2],
        8:  [10, 4, 3],
        9:  [15, 5, 3],
        10: [25, 0, 6],
        11: [20, 10, 5] // endless - multiplied by a factor depending on wave 
    },
    // delay between enemy spawns in milliseconds
    spawn_delay: 250,
    // how far from the player an enemy should spawn
    spawn_distances: [35, 18, 25],
    chance_to_spawn_near_tank: 0.85,
    bolt_spawn_waves: [1, 3, 5, 9]
}

const camera_settings = {
    aspect : 1.57592444126543,
    far: 1000,
    fovy : 1.024778957977204,
    half : 1,
    near : 0.10000000149011612,
    orthographic : 0
}

const player_settings = {
    melee_damage: 20,
    damage_multiplier: 2 // MULTIPLIER?? MARKET PLIERS?? MARKIPLIER??
}

const enemy_settings = {
    standard: {
        melee_attack_duration: 1,
        melee_attack_cooldown: 2,
        melee_attack_range: 6,
        health: 5,
        ranged_duration_timer: 0,
        ranged_attack_duration: 1
    },
    fast: {
        melee_attack_range: 6,
        melee_attack_duration: 0.5,
        melee_attack_cooldown: 1,
        health: 1
    },
    tank: {
        melee_attack_range: 10,
        melee_attack_duration: 1,
        melee_attack_cooldown: 3,
        health: 40,
        damage_reduction: 10 // (1 - damage_reduction) = damage reduction%
    }
}

export {
    wave_settings,
    camera_settings,
    player_settings,
    enemy_settings
}