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
import { Animator, Keyframe } from './Animator.js';



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
        BOLT_PICKUP: 12,
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

    },
    
    collision_decision : function (game, inst1, inst2){
        if (inst1.type == this.type_enum.HARPOON_PROJECTILE && inst2 instanceof Enemy) {
            inst2.take_damage(1);
            game.remove_instance(inst1.id);
        } else if (inst2.type == this.type_enum.HARPOON_PROJECTILE && inst1 instanceof Enemy){
            inst1.take_damage(1);
            game.remove_instance(inst2.id);
        } else if (inst1.type == this.type_enum.HARPOON_PROJECTILE){
            //hit normal rigid body
            inst1.properties.velocity_2d = vec2.create();
            inst1.properties.is_dynamic = false;
            inst1.properties.is_rigid = false;
            this.transfer_render_node(inst2, inst1);
            game.remove_instance(inst1.id);
        } else if (inst1.type == this.type_enum.PLAYER && inst2.type == this.type_enum.BUBBLE_PROJECTILE){
            inst1.take_damage(1);
            game.remove_instance(inst2.id);
        } else if (inst2.type == this.type_enum.PLAYER && inst1.type == this.type_enum.BUBBLE_PROJECTILE) {
            inst2.take_damage(1);
            game.remove_instance(inst1.id);
        } else if (inst1.type == this.type_enum.PLAYER && inst2.type == this.type_enum.BOLT_PICKUP){
            inst1.pickup_bolt(1);
            game.remove_instance(inst2.id);
        } else if (inst2.type == this.type_enum.PLAYER && inst1.type == this.type_enum.BOLT_PICKUP) {
            inst2.pickup_bolt(1);
            game.remove_instance(inst1.id);
        }

    },

    transfer_render_node : function (parent_inst, child_inst){
        parent_inst.render_node.addChild(child_inst.render_node);
        const parent_transform = parent_inst.render_node.getComponentOfType(Transform);
        const child_transform = child_inst.render_node.getComponentOfType(Transform);
        //fix scale
        child_transform.scale[0] = child_transform.scale[0] / parent_transform.scale[0];
        child_transform.scale[1] = child_transform.scale[1] / parent_transform.scale[1];
        child_transform.scale[2] = child_transform.scale[2] / parent_transform.scale[2];
        //fix translation
        child_transform.translation[0] = (parent_transform.translation[0] - child_transform.translation[0]) * child_transform.scale[0];
        if (child_transform.translation[1] > parent_transform.translation[1]){
            child_transform.translation[1] = (child_transform.translation[1] - parent_transform.translation[1]) * child_transform.scale[1];
        } else {
            child_transform.translation[1] = (parent_transform.translation[1] - child_transform.translation[1]) * child_transform.scale[1];
        }
        child_transform.translation[2] = (parent_transform.translation[2] - child_transform.translation[2]) * child_transform.scale[2];
        //fix rotation
        const new_rot = quat.clone(parent_transform.rotation);
        quat.invert(new_rot, new_rot);
        quat.multiply(new_rot, new_rot, child_transform.rotation);
        child_transform.rotation = new_rot;
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
        avoid_displacement = false,
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
        this.avoid_displacement = avoid_displacement;
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
            if (vec2.length(this.properties.velocity_2d) < 0.005){
                vec2.scale(this.properties.velocity_2d, this.properties.velocity_2d, 0);
            }
            const final_velocity = vec2.clone(this.properties.velocity_2d);
            vec2.scale(final_velocity, final_velocity, dt);
            vec2.add(this.world_position, this.world_position, final_velocity);
 
        }
        this.update_3d_position(t, dt);

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
    
    update_3d_position(t, dt){
        //updates 3d Node vectors with the game 2d vectors

        const x_off = this.properties.model_x_offset != undefined ? this.properties.model_x_offset : 0;
        const y_off = this.properties.model_y_offset != undefined ? this.properties.model_y_offset : 0;

        const trans = this.render_node.getComponentOfType(Transform); 
        trans.translation[0] = this.world_position[0];
        trans.translation[2] = this.world_position[1];
        trans.translation[1] = this.elevation;
        
        const x_angle = Math.atan2(this.facing_direction[1], this.facing_direction[0]);
        const q_rot = quat.create();

        const rot_offset = this.properties.model_rotation_offset != undefined ? this.properties.model_rotation_offset : 0;
        quat.rotateY(q_rot, q_rot, x_angle - Math.PI +  rot_offset * (Math.PI/180));
        trans.rotation = q_rot;

        this.apply_animators(t, dt);
    }

    apply_animators(t, dt){
        this.render_node.traverse(subnode => {
            const animator = subnode.getComponentOfType(Animator);
            if (animator != undefined){
                animator.update(t, dt);
            }
        });
    }
}

export class WaveCrate extends GameInstance{
    constructor(game_ref, id, type, {
        gravity = 10,
        start_y_vel = -20,
    } = {}) {
        super(game_ref, id, type);
        this.gravity = gravity;
        this.y_velocity = start_y_vel;
    }

    take_damage(damage){
        this.game_ref.crate_break_event();
        this.game_ref.remove_instance(this.id);
    }   

    update(t, dt){
        if (this.elevation > this.properties.model_elevation){
            this.y_velocity -= this.gravity * dt;
            this.elevation += this.y_velocity * dt;
            if (this.elevation < this.properties.model_elevation) this.elevation = this.properties.model_elevation;
        }
        super.update(t, dt);
    }
}

export class BoltPickup extends GameInstance{
    constructor(game_ref, id, type, {
    } = {}) {
        super(game_ref, id, type);
    }

    update(t, dt){
        
        super.update(t, dt);
    }
}


export class Player extends GameInstance{
    constructor(game_ref, id, type, {
        player_state = 0,
        health = 10,
        weapon = undefined,
        melee_cooldown = 0.7,
        reload_length = 0.3,
        cur_weapon_load = 0,
        max_weapon_load = 0,
        weapon_load_cap = 5,
        melee_attack_range = 3,

        player_state_enum = {
            PLAYER_IDLE : 0,
            PLAYER_RELOADING : 1,
            PLAYER_RUNNING : 2,
        }


    } = {}) {
        super(game_ref, id, type);
        this.player_state = player_state;
        this.health = health;
        this.weapon = weapon;
        this.melee_cooldown = melee_cooldown;
        this.reload_length = reload_length;
        this.melee_timer = 0;
        this.melee_attack_range = melee_attack_range;
        this.reload_timer = 0;
        this.cur_weapon_load = cur_weapon_load;
        this.max_weapon_load = max_weapon_load;
        this.weapon_load_cap = weapon_load_cap;
        this.player_state_enum = player_state_enum;
    }

    take_damage(damage){
        console.log("player took damage");
    }

    pickup_bolt(num){
        if (this.max_weapon_load + num <= this.weapon_load_cap){
            this.max_weapon_load += num;
        }
        this.game_ref.bolt_pickup_event();
    }

    reload(t, dt){
        switch (this.player_state){
            case this.player_state_enum.PLAYER_IDLE:
            case this.player_state_enum.PLAYER_RUNNING:
                if (this.cur_weapon_load < this.max_weapon_load && t > this.reload_timer){
                    this.reload_timer = t + this.reload_length;
                    //start reload
                    this.weapon.reload_animation();
                    this.weapon.loaded_count += 1;
                    this.cur_weapon_load += 1;
                    this.player_state = this.player_state_enum.PLAYER_RELOADING;
                }
                break;
            default:
                break;
        }

    }

    click(t, dt){
        switch (this.player_state){
            case this.player_state_enum.PLAYER_IDLE:
            case this.player_state_enum.PLAYER_RUNNING:
                if (this.cur_weapon_load > 0){
                    //shoot
                    this.melee_timer = t + this.melee_cooldown/2; //prevent instantly melee attacking after shooting
                    this.weapon.shoot(this);
                    this.shoot_animation();

                } else if (t > this.melee_timer){
                    //melee
                    this.melee_timer = t + this.melee_cooldown;
                    this.weapon.melee_animation();
                    this.melee_animation();
                    this.attempt_melee();
                }
                break;
            default:
                break;
        }
    }

    attempt_melee(){
        const scan_size = 1;
        const range = this.melee_attack_range;

        const looking_dir = vec2.clone(this.facing_direction);
        looking_dir[0] = -looking_dir[0];
        vec2.scale(looking_dir, looking_dir, range);
        const attack_location = vec2.fromValues(this.world_position[0], this.world_position[1]);
        vec2.add(attack_location, attack_location, looking_dir);

        const attack_3d_min = vec3.create();
        attack_3d_min[0] = attack_location[0] - scan_size;
        attack_3d_min[2] = attack_location[1] - scan_size;
        attack_3d_min[1] = -2;
        const attack_3d_max = vec3.create();
        attack_3d_max[0] = attack_location[0] + scan_size;
        attack_3d_max[2] = attack_location[1] + scan_size;
        attack_3d_max[1] = 10;
        const attack_bb = {min : attack_3d_min, max : attack_3d_max};

        for (let i = 0; i < this.game_ref.instances.length; i++){
            const instance = this.game_ref.instances[i];
            if (instance == undefined || instance === this.game_ref.player || instance.properties.is_rigid != true) continue;

            const inst_bb = this.game_ref.physics.getTransformedAABB(instance);
            if (this.game_ref.physics.aabbIntersection(inst_bb, attack_bb) == true){
                instance.take_damage?.(2);
                break;
            }

        }
    }

    melee_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "melee_animation"){
                animator.start_animation();
            }
        });
    }

    shoot_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "shoot_animation"){
                animator.start_animation();
            }
        });
    }

    running_animation(start_running){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "run_animation"){
                if (start_running == true){
                    animator.start_animation();
                    animator.stop_once_finished = false;
                } else if (this.player_state == this.player_state_enum.PLAYER_IDLE){
                    //player is in idle
                    animator.stop_animation();
                } else {
                    //player went from running to idle
                    animator.run_animation_until_end();
                }
            }
        });
    }

    update(t, dt){

        switch (this.player_state){
            case this.player_state_enum.PLAYER_IDLE:
                if (vec2.length(this.properties.acceleration_2d) > 0){
                    this.player_state = this.player_state_enum.PLAYER_RUNNING;
                    this.running_animation(true);
                }
                break;
            case this.player_state_enum.PLAYER_RUNNING:
                if (vec2.length(this.properties.acceleration_2d) == 0){
                    this.running_animation(false);
                    this.player_state = this.player_state_enum.PLAYER_IDLE;
                }
                break;
            case this.player_state_enum.PLAYER_RELOADING:
                if (t > this.reload_timer){
                    //when finishing reload
                    this.weapon.change_model(this.weapon.loaded_count);
                    this.player_state = this.player_state_enum.PLAYER_IDLE;
                    //go back to running or idle
                    if (vec2.length(this.properties.acceleration_2d) > 0){
                        this.player_state = this.player_state_enum.PLAYER_RUNNING;
                        this.running_animation(true);
                    } else {
                        this.player_state = this.player_state_enum.PLAYER_IDLE;
                        this.running_animation(false);
                    }
                }
                break;
            default:
                break;
        }

        this.game_ref.UI_data.weapon_ui_variation = this.cur_weapon_load;
        this.stick_to_player(t, dt);
        super.update(t,dt);
    }

    stick_to_player(t, dt){
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
    }
}

export class HarpoonGunWeapon extends GameInstance {
    constructor(game_ref, id, type, {
        loaded = 0,
    } = {}) {
        super(game_ref, id, type);
        this.loaded_count = loaded;
    }

    reload_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "reload_animation"){
                animator.start_animation();

            }
        });
    }

    melee_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "melee_animation"){
                animator.start_animation();

            }
        });
    }

    shoot_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "shoot_animation"){
                animator.start_animation();
            }
        });
    }

    shoot(player_ref){
        const dist = 1;
        const spread_dist = 3;
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

        const shoot_angle_offset = -Math.PI / 18; 
        const N = Math.floor(this.loaded_count / 2);
        for (let i = -N; i <= N; i++) {
            if (this.loaded_count % 2 == 0 && i == 0) continue;
        
            const properties = JSON.parse(JSON.stringify(this.game_ref.loader.instance_init_lookup[GameInstance_tool.type_enum.HARPOON_PROJECTILE - 1].properties));
            const spawn_pos = vec2.clone(projectile_pos);

            const dir = vec2.clone(player_ref.facing_direction);
            dir[0] = -dir[0];
            vec2.scale(dir, dir, spread_dist);
            vec2.rotate(dir, dir, [0, 0], shoot_angle_offset * i);
            vec2.add(spawn_pos, spawn_pos, dir);
        
            let angle = Math.atan2(dir[1], -dir[0]);
            if (angle < 0) angle += 2 * Math.PI;
        
            vec2.scale(properties.velocity_2d, dir, properties.max_speed);

            this.game_ref.create_instance(GameInstance_tool.type_enum.HARPOON_PROJECTILE, spawn_pos, elevation, angle, properties);
        }
        
        this.shoot_animation();
        player_ref.cur_weapon_load = 0;
        this.loaded_count = 0; 
        this.change_model(0);
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
        melee_attack_duration = 1,
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
        this.melee_attack_length = melee_attack_duration;
        this.ranged_attack_range_min = ranged_attack_range_min;
        this.ranged_attack_range_max = ranged_attack_range_max;
        this.ranged_attack_cooldown = ranged_attack_cooldown;
        this.attempted_melee = false;
        this.melee_successful = false;

        this.state_enum = GameInstance_tool.enemy_state_enum;
        this.state = this.state_enum.CHASE_PLAYER;

        this.melee_duration_timer = 0;
        this.melee_cooldown_timer = 0;
        this.ranged_timer = 0;
    }

    take_damage(damage){
        this.health -= damage;
        if (this.health <= 0){
            this.game_ref.enemy_death_event(this.id, this.type);
            this.game_ref.remove_instance(this.id);
        }
    }

    running_animation(start_running){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "run_animation"){
                if (start_running == true){
                    animator.start_animation();
                } else {
                    animator.stop_animation();
                } 
            }
        });
    }

    melee_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "melee_animation"){
                animator.run_animation_until_end();
            }
        });
    }

    idle_animation(start_running){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "idle_animation"){
                if (start_running){
                    animator.run_animation_until_end_repeated();
                } else {
                    animator.stop_animation();
                }
            }
        });
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

        if (dist < this.melee_attack_range){
            this.melee_duration_timer = t + this.melee_attack_duration;
            this.avoid_displacement = true;
            this.melee_animation();
        }
    }

    scan_for_melee_attack(scan_size){

        const range = this.melee_attack_range;

        const player_dir = this.player_dir();
        vec2.scale(player_dir, player_dir, range);
        const attack_location = vec2.fromValues(this.world_position[0], this.world_position[1]);
        vec2.add(attack_location, attack_location, player_dir);

        const attack_3d_min = vec3.create();
        attack_3d_min[0] = attack_location[0] - scan_size;
        attack_3d_min[2] = attack_location[1] - scan_size;
        attack_3d_min[1] = -2;
        const attack_3d_max = vec3.create();
        attack_3d_max[0] = attack_location[0] + scan_size;
        attack_3d_max[2] = attack_location[1] + scan_size;
        attack_3d_max[1] = 10;
        
        const attack_bb = {min : attack_3d_min, max : attack_3d_max};
        const player_bb = this.game_ref.physics.getTransformedAABB(this.game_ref.player);

        const hit = this.game_ref.physics.aabbIntersection(player_bb, attack_bb);
        if (hit == true){
            this.game_ref.player.take_damage();
        }

        return hit;
    }
}

export class StandardEnemy extends Enemy{
    constructor(game_ref, id, type){
        super(game_ref, id, type);
        this.player = game_ref.player;
        
        //enemy type specific
        super.melee_attack_duration = 1;
        super.melee_attack_cooldown = 2;
        super.melee_attack_range = 6;
        super.health = 2;
        super.state = this.state_enum.CHASE_PLAYER;
        this.ranged_duration_timer = 0;
        this.ranged_attack_duration = 1;
    }

    ranged_animation(){
        const animators = this.render_node.getComponentsOfType(Animator);
        animators.forEach(animator => {
            if (animator.label == "ranged_animation"){
                animator.run_animation_until_end();
            }
        });
    }

    update(t, dt){
        this.track_player(t, dt);

        switch (this.state) {
            case this.state_enum.CHASE_PLAYER:
                this.move_to_player(t, dt);
                if (this.dist_to_player() < this.melee_attack_range && t > this.melee_cooldown_timer) {
                    this.melee_cooldown_timer = t + this.melee_attack_cooldown;
                    this.state = this.state_enum.MELEE_ATTACK;
                    this.running_animation(false);
                    this.attempt_melee_attack(t, dt);
                }
                break;
            case this.state_enum.MELEE_ATTACK:
                if (t > this.melee_duration_timer){
                    //ended melee attack
                    this.avoid_displacement = false;
                    if (this.melee_successful == true){
                        //start running again
                        this.running_animation(true);
                        this.state = this.state_enum.CHASE_PLAYER;
                    } else {
                        //missed melee, attack at range
                        this.ranged_timer = t + this.ranged_attack_cooldown;
                        this.idle_animation(true);
                        this.state = this.state_enum.POSITION_FOR_RANGED;
                    }
                    this.attempted_melee = false;
                } else if ((this.melee_duration_timer - t) < this.melee_attack_duration / 3 && this.attempted_melee == false){
                    //register if hit player
                    this.melee_successful = this.scan_for_melee_attack(1);
                    this.attempted_melee = true;
                }
                break;
            case this.state_enum.POSITION_FOR_RANGED:
                const dist = this.dist_to_player();
                if (dist >= this.ranged_attack_range_min && dist <= this.ranged_attack_range_max) {
                    //player is in the ranged attack distance zone
                    this.ranged_duration_timer = t + this.ranged_attack_duration;
                    this.ranged_animation();
                    this.idle_animation(false);
                    this.state = this.state_enum.RANGED_ATTACK;
                } else if (dist > this.ranged_attack_range_max || t > this.ranged_timer){
                    //ran out of max distance or the time window for ranged attack ran out
                    this.running_animation(true);
                    this.idle_animation(false);
                    this.state = this.state_enum.CHASE_PLAYER;
                }
                break;
            case this.state_enum.RANGED_ATTACK:
                //shoot projectile and start chasing player again
                if (t >  this.ranged_duration_timer){
                    this.spawn_projectile();
                    this.running_animation(true);
                    this.state = this.state_enum.CHASE_PLAYER;
                }
                break;
            default:
                console.log("STATELESS ERROR - " + this.id);
          }

        super.update(t, dt);
    }

    spawn_projectile(){
        const spawn_position = vec2.create();
        vec2.add(spawn_position, spawn_position, this.world_position);

        const dist = 3;
        const spawn_elevation = 2;

        const spawn_dir = vec2.clone(this.facing_direction);
        spawn_dir[0] = -spawn_dir[0];
        vec2.scale(spawn_dir, spawn_dir, dist);
        vec2.add(spawn_position, spawn_position, spawn_dir);
        
        const properties = JSON.parse(JSON.stringify(this.game_ref.loader.instance_init_lookup[GameInstance_tool.type_enum.BUBBLE_PROJECTILE - 1].properties));

        const player_dir = this.player_dir();
        vec2.scale(properties.velocity_2d, player_dir, properties.max_speed);
        let angle = Math.atan2(player_dir[1], -player_dir[0]);
        if (angle < 0) angle += 2 * Math.PI;

        this.game_ref.create_instance(GameInstance_tool.type_enum.BUBBLE_PROJECTILE, spawn_position, spawn_elevation, angle, properties);

    }
}


export class TankEnemy extends Enemy {
    constructor(game_ref, id, type){
        super(game_ref, id, type);
        this.player = game_ref.player;
        
        //enemy type specific
        super.melee_attack_range = 10;
        super.melee_attack_duration = 1;
        super.melee_attack_cooldown = 3;
        super.health = 10;
        super.state = this.state_enum.CHASE_PLAYER;

    }

    update(t, dt){
        this.track_player(t, dt);

        switch (this.state) {
            case this.state_enum.CHASE_PLAYER:
                this.move_to_player(t, dt);
                if (this.dist_to_player() < this.melee_attack_range && t > this.melee_cooldown_timer) {
                    this.melee_cooldown_timer = t + this.melee_attack_cooldown;
                    this.state = this.state_enum.MELEE_ATTACK;
                    this.running_animation(false);
                    this.attempt_melee_attack(t, dt);
                }
                break;
            case this.state_enum.MELEE_ATTACK:
                if (t > this.melee_duration_timer){
                    //ended melee attack
                    this.avoid_displacement = false;
                    this.running_animation(true);
                    this.state = this.state_enum.CHASE_PLAYER;
                    this.attempted_melee = false;
                } else if ((this.melee_duration_timer - t) > this.melee_attack_duration / 2 && this.attempted_melee == false){
                    //register if hit player
                    this.melee_successful = this.scan_for_melee_attack(1.5);
                    this.attempted_melee = true;
                }
                break;
            default:
                console.log("STATELESS ERROR - " + this.id);
          }

        super.update(t, dt);
    }
}


export class FastEnemy extends Enemy {
    constructor(game_ref, id, type){
        super(game_ref, id, type);
        this.player = game_ref.player;
        
        //enemy type specific
        super.melee_attack_range = 6;
        super.melee_attack_duration = 0.5;
        super.melee_attack_cooldown = 1;
        super.health = 1;
        super.state = this.state_enum.CHASE_PLAYER;

    }

    update(t, dt){
        this.track_player(t, dt);

        switch (this.state) {
            case this.state_enum.CHASE_PLAYER:
                this.move_to_player(t, dt);
                if (this.dist_to_player() < this.melee_attack_range && t > this.melee_cooldown_timer) {
                    this.melee_cooldown_timer = t + this.melee_attack_cooldown;
                    this.state = this.state_enum.MELEE_ATTACK;
                    this.running_animation(false);
                    this.attempt_melee_attack(t, dt);
                }
                break;
            case this.state_enum.MELEE_ATTACK:
                if (t > this.melee_duration_timer){
                    //ended melee attack
                    this.avoid_displacement = false;
                    this.running_animation(true);
                    this.state = this.state_enum.CHASE_PLAYER;
                    this.attempted_melee = false;
                } else if ((this.melee_duration_timer - t) > this.melee_attack_duration / 2 && this.attempted_melee == false){
                    //register if hit player
                    this.melee_successful = this.scan_for_melee_attack(2);
                    this.attempted_melee = true;
                }
                break;
            default:
                console.log("STATELESS ERROR - " + this.id);
          }

        super.update(t, dt);
    }
}