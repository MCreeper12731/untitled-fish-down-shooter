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
        HARPOON_LOADED_1: 12,
        HARPOON_PROJECTILE: 13,
        BUBBLE_PROJECTILE: 14
    },
    

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
        this.game = game_ref;
        this.id = id;
        this.type = type;
        this.world_position = world_position;
        this.facing_direction = facing_direction;
        this.elevation = elevation;
        this.properties = properties;
        this.render_node = render_node;
    }

    update(t, dt){

        if (this.properties.is_dynamic == true){
            
            const speed = vec2.length(this.properties.velocity_2d);
            if (speed < this.properties.max_speed || this.properties.can_bypass_max_speed) {
                vec2.scaleAndAdd(this.properties.velocity_2d, this.properties.velocity_2d, this.properties.acceleration_2d, dt * this.properties.acceleration);
            }

            const decay = Math.exp(dt * Math.log(1 - this.properties.friction));
            vec2.scale(this.properties.velocity_2d, this.properties.velocity_2d, decay);            
            
            vec2.add(this.world_position, this.world_position, this.properties.velocity_2d);
        }
        this.update_3d_position();

    }

    update_2d_position(){
        //updates 2d vectors with the Node 3d vectors
        const t = this.render_node.getComponentOfType(Transform);
        this.elevation = t.translation[1];
        this.world_position = [t.translation[0], t.translation[2]];

        const x_angle = quat.getAxisAngle([1,0,0], t.rotation);
        const facing_dir = vec2.create();
        vec2.add(facing_dir, facing_dir, [1, 0]);
        vec2.rotate(facing_dir, facing_dir, [0,0], x_angle);
        this.facing_direction = facing_dir;
    }
    
    update_3d_position(){
        //updates 3d Node vectors with the game 2d vectors
        const t = this.render_node.getComponentOfType(Transform); 
        t.translation[0] = this.world_position[0];
        t.translation[2] = this.world_position[1];
        t.translation[1] = this.elevation;
        
        const x_angle = Math.atan2(this.facing_direction[1], this.facing_direction[0])
        const q_rot = quat.create();
        quat.rotateY(q_rot, q_rot, x_angle - Math.PI);
        t.rotation = q_rot;
    }
}

export class Player extends GameInstance{
    constructor(game_ref, id, type, {
        player_state = 0,
        health = 10,
        primary_weapon = undefined,
        basic_melee = undefined,


    } = {}) {
        super(game_ref, id, type);
        this.player_state = player_state
        this.health = health,
        this.primary_weapon = primary_weapon
        this.basic_melee = basic_melee
    }

    update(t, dt){
        super.update(t,dt);
    }
}

export class Enemy extends GameInstance{
    constructor(game_ref, id, type, {
        health = 10,
        difficulty = 10,
        cash_drop = 3,
        enemy_state = 0,
        ai = undefined,
    } = {}) {
        super(game_ref, id, type);
        this.health = health;
        this.difficulty = difficulty;
        this.cash_drop = cash_drop;
        this.enemy_state = enemy_state;
        this.ai = ai;
    }

    update(t, dt){
        super.update(t,dt);
    }
}
