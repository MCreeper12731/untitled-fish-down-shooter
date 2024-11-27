import {
    Node,
    Camera,
    Transform,
    Model,
    Texture,
    Sampler,
    Primitive,
    Material
} from 'engine/core.js';
import { Game } from './Game.js';
import { quat, vec3, mat4, vec2 } from 'glm';
import * as glm from 'glm';


export const GameInstance_tool = Object.freeze({
    type_enum : {
        //nodes with an ID > 0 are loaded into the instance buffer
        SUBNODE: -5,
        LIGHT : -4,
        CAMERA : -3,
        SCENE: -2,
        UNDEFINED: -1,
        WORLD_MAP: 0,
        TREE_FOLIAGE:  1,
        TREE_DEAD: 2,
        ROCK: 3,
        SHOP: 4,
        GRASS: 5,
        CRATE: 6,
        PLAYER: 7,
        ENEMY_STANDARD: 8,
        ENEMY_FAST: 9,
        ENEMY_TANK: 10,
        HARPOON_EMPTY: 11,
        LEGACY_DO_NOT_INSTANTIATE: 12,
        HARPOON_PROJECTILE: 13,
        BUBBLE_PROJECTILE: 14
    },

    enemy_state_enum : {
        CHASE_PLAYER : 0,
        MELEE_ATTACK : 1,
        POSITION_FOR_RANGED : 2,
        RANGED_ATTACK : 3,
        DASHING : 4,
        DODGING : 5

    }
    

});

export class GameInstance_type{
    constructor(id, {
    } = {}) {
        this.type_id = id
    }
}


export class GameInstance{

    constructor(game_ref, id, type, {
        world_position = [0, 0],
        facing_direction = [1, 0],
        elevation = 0,
        properties = {
            is_dynamic : false,
            is_rigid : false,
            velocity_2d : [0, 0],
            max_speed : 0,
            can_bypass_max_speed : false,
            acceleration_2d : [0, 0],
            acceleration : 0,
            friction : 0,
            bounding_box : undefined,
        },
        render_node = undefined
    } = {}) {
        this.model_buffer = [];
        this.game_ref = game_ref;
        this.id = id;
        this.type = type;
        this.world_position = world_position;
        this.facing_direction = facing_direction;
        this.elevation = elevation;
        this.properties = properties;
        this.render_node = render_node;
    }

    update(t, dt){
        if (this.properties.is_dynamic === true){

            const current_acceleration = vec2.clone(this.properties.acceleration_2d);
            const current_velocity = vec2.clone(this.properties.velocity_2d);

            //apply acceleration if speed withing bounds
            const acc_dt = vec2.clone(current_acceleration);
            vec2.scale(acc_dt, acc_dt, dt);
            const new_velocity = vec2.clone(current_velocity);
            vec2.add(new_velocity, new_velocity, acc_dt);

            //unit acceleration vector
            const acc_norm = vec2.clone(current_acceleration);
            vec2.normalize(acc_norm, acc_norm);
            //component of new velocity vector pointing in the direction of acceleration
            const forward_vel = vec2.clone(acc_norm);
            const dotProduct = vec2.dot(new_velocity, acc_norm);

            if (vec2.length(new_velocity) < this.properties.max_speed || this.properties.can_bypass_max_speed){
                
                vec2.scale(forward_vel, forward_vel, dotProduct);

            }

            //component perpendicular to acceleration  - dampen this
            const dampen_vel = vec2.clone(new_velocity);
            vec2.subtract(dampen_vel, dampen_vel, forward_vel);
            const decay = Math.exp(dt * Math.log(1 - this.properties.friction));
            vec2.scale(dampen_vel, dampen_vel, decay);


            //combine them back
            vec2.add(forward_vel, forward_vel, dampen_vel);
            this.properties.velocity_2d = forward_vel;


            //apply final speeds
            const final_velocity = vec2.clone(this.properties.velocity_2d);
            vec2.scale(final_velocity, final_velocity, dt);
            vec2.add(this.world_position, this.world_position, final_velocity);
 
        }
        this.update_3d_position();

        //cull projectiles out of world
        if (vec2.length(this.world_position) > 100){
            this.game_ref.remove_instance(this.id);
        }
    }

    change_model(change_ind){
        this.render_node.removeComponentsOfType(Model);
        this.render_node.addComponent(this.model_buffer[change_ind]);
    }

    update_2d_position(){
        //updates 2d vectors with the Node 3d vectors
        const t = this.render_node.getComponentOfType(Transform);
        this.elevation = t.translation[1];
        this.world_position = [t.translation[0], t.translation[2]];

        const x_angle = quat.getAxisAngle([1,0,0], t.rotation);
        const facing_dir = vec2.create();
        vec2.add(facing_dir, facing_dir, [1, 0]);
        vec2.rotate(facing_dir, facing_dir, [0,0], -x_angle);
        this.facing_direction = facing_dir;
    }
    
    update_3d_position(){
        //updates 3d Node vectors with the game 2d vectors

        const x_off = this.properties.model_x_offset != undefined ? this.properties.model_x_offset : 0;
        const y_off = this.properties.model_y_offset != undefined ? this.properties.model_y_offset : 0;

        const t = this.render_node.getComponentOfType(Transform); 
        t.translation[0] = this.world_position[0];
        t.translation[2] = this.world_position[1];
        t.translation[1] = this.elevation;
        
        const x_angle = Math.atan2(this.facing_direction[1], this.facing_direction[0]);
        const q_rot = quat.create();

        const rot_offset = this.properties.model_rotation_offset != undefined ? this.properties.model_rotation_offset : 0;
        quat.rotateY(q_rot, q_rot, x_angle - Math.PI +  rot_offset * (Math.PI/180));
        t.rotation = q_rot;
    }
}

export class WaveCrate extends GameInstance{
    constructor(game_ref, id, type, {
        gravity = 9.81,
    } = {}) {
        super(game_ref, id, type);
        this.gravity = gravity;
        this.y_velocity = 0;
    }

    update(t, dt){
        if (this.elevation > 0){
            this.y_velocity -= this.gravity * dt; 
            this.elevation += this.y_velocity * dt;
            if (this.elevation < 0) this.elevation = 0;
        }
        super.update(t, dt);
    }


}

export class Player extends GameInstance{
    constructor(game_ref, id, type, {
        player_state = 0,
        health = 10,
        weapon = undefined,
        melee_cooldown = 1,
        reload_length = 1,
        weapon_load = 0,
        max_weapon_load = 5,


    } = {}) {
        super(game_ref, id, type);
        this.player_state = player_state;
        this.health = health;
        this.weapon = weapon;
        this.melee_cooldown = melee_cooldown;
        this.reload_lenght = reload_length;
        this.melee_timer = 0;
        this.reload_timer = 0;
        this.weapon_load = weapon_load;
        this.max_weapon_load = max_weapon_load;

    }

    switch_weapon_state(){

        this.weapon_load = (this.weapon_load + 1) % (this.max_weapon_load + 1);
        this.weapon.change_model(this.weapon_load);
        this.weapon.loaded = this.weapon_load;

    }

    click(t, dt){
        
        if (t > this.melee_timer){
            this.melee_timer = t + this.melee_cooldown;
            
            this.weapon.shoot(this);


            this.switch_weapon_state();
        }
    }

    update(t, dt){

        this.weapon.properties.acceleration_2d = vec2.clone(this.properties.acceleration_2d);
        this.weapon.properties.friction = this.properties.friction;
        this.weapon.properties.max_speed = this.properties.max_speed;

        const dist = 1.3;
        const x_off = -1.4;
        const elevation  = -0.1;
    
        const weapon_pos = vec2.clone(this.world_position);
        const player_facing = vec2.clone(this.facing_direction);
        vec2.scale(player_facing, player_facing, dist);

        player_facing[0] = -player_facing[0];
        vec2.add(weapon_pos, weapon_pos, player_facing);
        
        const perp = vec2.clone(player_facing);
        const tmp = perp[0];
        perp[0] = perp[1];
        perp[1]= -tmp;
        vec2.normalize(perp, perp);
        vec2.scale(perp, perp, x_off);
        vec2.add(weapon_pos, weapon_pos, perp);

        this.weapon.world_position = weapon_pos;
        this.weapon.elevation = elevation;

        this.weapon.facing_direction = vec2.clone(this.facing_direction);

        super.update(t,dt);
    }
}

export class HarpoonGunWeapon extends GameInstance {
    constructor(game_ref, id, type, {
        loaded = 0,

    } = {}) {
        super(game_ref, id, type);
        this.loaded_count = loaded;


    }

    shoot(player_ref){

        const properties = structuredClone(
            this.game_ref.loader.instance_init_lookup[GameInstance_tool.type_enum.HARPOON_PROJECTILE - 1].properties
        );

        const dist = 4;
        const x_off = -1.05;
        const elevation  = 2.4;
    
        const projectile_pos = vec2.clone(player_ref.world_position);
        const player_facing = vec2.clone(player_ref.facing_direction);
        vec2.scale(player_facing, player_facing, dist);

        player_facing[0] = -player_facing[0];
        vec2.add(projectile_pos, projectile_pos, player_facing);
        
        const perp = vec2.clone(player_facing);
        const tmp = perp[0];
        perp[0] = perp[1];
        perp[1]= -tmp;
        vec2.normalize(perp, perp);
        vec2.scale(perp, perp, x_off);
        vec2.add(projectile_pos, projectile_pos, perp);

        const dir = vec2.clone(player_ref.facing_direction);
        dir[0] = -dir[0];
        let angle = Math.atan2(dir[1], -dir[0]);
        if (angle < 0) angle += 2 * Math.PI;

        //aim dir != player facing dir FIXXXDX
        vec2.scale(properties.velocity_2d, dir, properties.max_speed);

        this.game_ref.create_instance(GameInstance_tool.type_enum.HARPOON_PROJECTILE, projectile_pos, elevation, angle, properties);

    }

    update(t, dt){
        super.update(t, dt);
    }
}

export class Enemy extends GameInstance{
    constructor(game_ref, id, type, {
        health = 10,
        difficulty = 10,
        cash_drop = 3,
        enemy_state = 0,
        turn_speed = 2,
        melee_attack_range = 5,
        melee_attack_cooldown = 1.5,
        ranged_attack_range_min = 15,
        ranged_attack_range_max = 20,
        ranged_attack_cooldown = 10,
    } = {}) {
        super(game_ref, id, type);
        this.health = health;
        this.difficulty = difficulty;
        this.cash_drop = cash_drop;
        this.enemy_state = enemy_state;
        this.turn_speed = turn_speed;
        this.melee_attack_range = melee_attack_range;
        this.melee_attack_cooldown = melee_attack_cooldown;
        this.ranged_attack_range_min = ranged_attack_range_min;
        this.ranged_attack_range_max = ranged_attack_range_max;
        this.ranged_attack_cooldown = ranged_attack_cooldown;

        this.melee_timer = 0;
        this.ranged_timer = 0;
    }

    update(t, dt){
        super.update(t,dt);
    }

    dist_to_player(){
        const player_dir = vec2.create();
        vec2.sub(player_dir, this.game_ref.player.world_position, this.world_position);
        return vec2.length(player_dir);
    }

    player_dir(){
        const player_dir = vec2.create();
        vec2.sub(player_dir, this.game_ref.player.world_position, this.world_position);
        vec2.normalize(player_dir, player_dir);
        return player_dir;
    }

    track_player(t, dt){
        const player_dir = vec2.create();
        vec2.sub(player_dir, this.game_ref.player.world_position, this.world_position);
        vec2.normalize(player_dir, player_dir);
        const tf = dt * this.turn_speed;
        const cur_dir = this.facing_direction;
        this.facing_direction = [-player_dir[0] * tf + (1 - tf) * cur_dir[0], player_dir[1] * tf + (1 - tf) * cur_dir[1]];
    }

    move_to_player(t, dt){
        const player_dir = vec2.create();
        vec2.sub(player_dir, this.game_ref.player.world_position, this.world_position);
        const dist = vec2.length(player_dir);
        vec2.normalize(player_dir, player_dir);

        if (dist > this.melee_attack_range){
            const acc = vec2.clone(player_dir);
            vec2.scale(acc, acc, this.properties.acceleration);
            this.properties.acceleration_2d = acc;
        } else {
            //stop accelerating
            this.properties.acceleration_2d = vec2.create();
        }
    }

    attempt_melee_attack(t, dt){
        const player_dir = vec2.create();
        vec2.sub(player_dir, this.game_ref.player.world_position, this.world_position);
        const dist = vec2.length(player_dir);
        vec2.normalize(player_dir, player_dir);
        const speed = vec2.length(this.properties.velocity_2d);

        if (dist < this.melee_attack_range){
            this.melee_timer = t + this.melee_attack_cooldown;
            console.log("attempted melee attack");
            return true;
        }
        return false;
    }
}

export class StandardEnemy extends Enemy{
    constructor(game_ref, id, type){
        super(game_ref, id, type);
        this.player = game_ref.player;

        //enemy type specific
        super.health = 20;
        this.state_enum = GameInstance_tool.enemy_state_enum;
        this.state = this.state_enum.CHASE_PLAYER;

    }

    update(t, dt){
        this.track_player(t, dt);

        switch (this.state) {
            case this.state_enum.CHASE_PLAYER:
                this.move_to_player(t, dt);
                if (this.dist_to_player() < this.melee_attack_range && t > this.melee_timer) {
                    this.melee_timer = t + this.melee_attack_cooldown;
                    this.state = this.state_enum.MELEE_ATTACK;
                }
                break;
            case this.state_enum.MELEE_ATTACK:
                const attack_status = this.attempt_melee_attack(t, dt);
                if (attack_status == false){
                    this.state = this.state_enum.CHASE_PLAYER;
                } else {
                    console.log("failed melee");
                    this.state = this.state_enum.POSITION_FOR_RANGED;
                    this.ranged_timer = t + this.ranged_attack_cooldown;
                }
                break;
            case this.state_enum.POSITION_FOR_RANGED:
                const dist = this.dist_to_player();
                if (dist >= this.ranged_attack_range_min && dist <= this.ranged_attack_range_max) {
                    this.state = this.state_enum.RANGED_ATTACK;
                } else if (dist > this.ranged_attack_range_max){
                    this.state = this.state_enum.CHASE_PLAYER;
                } else if (t > this.ranged_timer) {
                    this.state = this.state_enum.CHASE_PLAYER;
                }
                break;
            case this.state_enum.RANGED_ATTACK:
                this.spawn_projectile();
                this.state = this.state_enum.CHASE_PLAYER;
                break;
            default:
                console.log("STATELESS ERROR - " + this.id);
          }

        super.update(t, dt);
    }

    spawn_projectile(){
        const spawn_position = vec2.create();
        vec2.add(spawn_position, spawn_position, this.world_position);
        vec2.add(spawn_position, spawn_position, this.facing_direction);
        const properties = structuredClone(
            this.game_ref.loader.instance_init_lookup[GameInstance_tool.type_enum.BUBBLE_PROJECTILE - 1].properties
        );
        const player_dir = this.player_dir();
        vec2.scale(properties.velocity_2d, player_dir, properties.max_speed);
        let angle = Math.atan2(player_dir[1], -player_dir[0]);
        if (angle < 0) angle += 2 * Math.PI;

        this.game_ref.create_instance(GameInstance_tool.type_enum.BUBBLE_PROJECTILE, spawn_position, 1, angle, properties);
    }
}


export class TankEnemy extends Enemy{
    constructor(game_ref, id, type){
        super(game_ref, id, type);
        this.player = game_ref.player;

        //enemy type specific
        super.health = 40;
        this.state_enum = GameInstance_tool.enemy_state_enum;
        this.state = this.state_enum.CHASE_PLAYER;

    }

    update(t, dt){
        this.track_player(t, dt);

        switch (this.state) {
            case this.state_enum.CHASE_PLAYER:
                this.move_to_player(t, dt);
                if (this.dist_to_player() < this.melee_attack_range && t > this.melee_timer) {
                    this.melee_timer = t + this.melee_attack_cooldown;
                    this.state = this.state_enum.MELEE_ATTACK;
                }
                break;
            case this.state_enum.MELEE_ATTACK:
                const attack_status = this.attempt_melee_attack(t, dt);
                this.state = this.state_enum.CHASE_PLAYER;
                break;
            default:
                console.log("STATELESS ERROR - " + this.id);
          }

        super.update(t, dt);
    }
}