import { quat, vec3, mat4, vec2 } from 'glm';
import {
    Accessor,
    Camera,
    Material,
    Mesh,
    Model,
    Node,
    Primitive,
    Sampler,
    Texture,
    Transform,
    Vertex,
} from 'engine/core.js';
import { GameInstance_type, GameInstance, GameInstance_tool, StandardEnemy, TankEnemy, WaveCrate, Player, HarpoonGunWeapon } from './GameInstance.js';

export class Keyframe {
    constructor({
        relative_trans = vec3.create(),
        relative_scale = vec3.fromValues(1,1,1),
        relative_rot = vec3.create(),
        runtime = 10,
        
    } = {}){
        this.ind = 0;
        this.relative_trans = relative_trans;
        this.relative_scale = relative_scale;
        this.relative_rot = relative_rot;

        this.translation_offset = vec3.create();
        this.scale_offset = vec3.fromValues(1,1,1),
        this.rotation_offset = vec3.create();

        this.end_runtime = runtime;
        this.cur_runtime = 0;
    }

    progress_keyframe(prev, t, dt){
        //transforms its relative positions with easing function according to dt
        this.translation_animation(prev, t, dt);
        this.scale_animation(prev, t, dt);
        this.rotation_animation(prev, t, dt);

        //update keypoint progress
        this.cur_runtime += dt;
        if (this.cur_runtime >= this.end_runtime){
            this.translation_offset = vec3.clone(this.relative_trans);
            this.scale_offset = vec3.clone(this.relative_scale);
            this.rotation_offset = vec3.clone(this.relative_rot);
            return true;
        }
        return false;
    }

    translation_animation(prev_keyframe, t, dt){
        const prev_trans = prev_keyframe.relative_trans;
        const cur_trans = this.relative_trans;
        const progress = this.cur_runtime / this.end_runtime;
        vec3.lerp(this.translation_offset, prev_trans, cur_trans, progress);
    }

    scale_animation(prev_keyframe, t, dt){
        const prev_scale = prev_keyframe.relative_scale;
        const cur_scale = this.relative_scale;
        const progress = this.cur_runtime / this.end_runtime;
        vec3.lerp(this.scale_offset, prev_scale, cur_scale, progress);
    }

    rotation_animation(prev_keyframe, t, dt){
        const prev_rot = prev_keyframe.relative_rot;
        const cur_rot = this.relative_rot;
        const progress = this.cur_runtime / this.end_runtime;
        vec3.lerp(this.rotation_offset, prev_rot, cur_rot, progress);
    }

}


export class Animator{

    constructor(render_node, label, {
        running = false,
        stop_once_finished = false,
        keep_pos_after_end = false,
    }= {}){
        this.label = label;
        this.render_node = render_node;
        this.transform = new Transform();
        this.keyframes = [new Keyframe()];
        this.running = running;
        this.cur_keyframe_ind = 1;
        this.cur_keyframe = undefined;
        this.prev_keyframe = undefined;
        this.stop_once_finished = stop_once_finished;
        this.keep_pos_after_end = keep_pos_after_end;
        this.hold_frame = false;
        this.run_until_end = false;

    }

    get_translation(){
        if (this.running || this.run_until_end){
            return this.cur_keyframe.translation_offset;
        } else if (this.keep_pos_after_end){
            return this.keyframes[this.keyframes.length - 1].translation_offset;
        }
        return vec3.create();
    }
    
    get_scale(){
        if (this.running || this.run_until_end){
            return this.cur_keyframe.scale_offset;
        } else if (this.keep_pos_after_end){
            return this.keyframes[this.keyframes.length - 1].scale_offset;
        }
        return vec3.fromValues(1,1,1);
    }

    get_rotation(){
        if (this.running || this.run_until_end){
            const q = quat.create();
            quat.fromEuler(q, this.cur_keyframe.rotation_offset[0], this.cur_keyframe.rotation_offset[1], this.cur_keyframe.rotation_offset[2]);
            return q;
        } else if (this.keep_pos_after_end){
            const q = quat.create();
            quat.fromEuler(q, this.keyframes[this.keyframes.length - 1].rotation_offset[0], this.keyframes[this.keyframes.length - 1].rotation_offset[1], this.keyframes[this.keyframes.length - 1].rotation_offset[2]);
            return q;
        }
        return quat.create();
    }

    update(t, dt){

        if (this.hold_frame == false){
            this.transform.translation = this.get_translation();
            this.transform.scale = this.get_scale();
            this.transform.rotation = this.get_rotation();
        } else {
            this.hold_frame = false;
        }

        if (this.running || this.run_until_end == true) {
            const status = this.cur_keyframe.progress_keyframe(this.prev_keyframe, t, dt);
            if (status){
                if (this.cur_keyframe_ind + 1 == this.keyframes.length){
                    this.cur_keyframe.cur_runtime = 0;
                    this.prev_keyframe.cur_runtime = 0;
                    this.cur_keyframe_ind = 1;
                    this.prev_keyframe = this.keyframes[0];
                    this.cur_keyframe = this.keyframes[1];
                    if (this.stop_once_finished == true) {
                        this.stop_animation();
                    } else {
                        this.start_animation();
                    }
                    this.cur_keyframe.progress_keyframe(this.prev_keyframe, t, dt); //reset first frame
                    this.run_until_end = false;
                    this.hold_frame = true;
                } else {
                    this.prev_keyframe.cur_runtime = 0;
                    this.prev_keyframe = this.keyframes[this.cur_keyframe_ind];
                    this.cur_keyframe_ind++;
                    this.cur_keyframe = this.keyframes[this.cur_keyframe_ind];
                    this.hold_frame = true;
                }
            }
        }

    }

    add_keyframes(keyframes){
        let ind = this.cur_keyframe_ind;
        keyframes.forEach(keyframe => {
            keyframe.ind = ind;
            ind++;
            this.keyframes.push(keyframe);
        });
        this.cur_keyframe = this.keyframes[this.cur_keyframe_ind];
        this.prev_keyframe = this.keyframes[0];
    }

    run_animation_until_end(){
        this.running = false;
        this.run_until_end = true;
        this.stop_once_finished = true;
    }

    run_animation_until_end_repeated(){
        this.running = true;
        this.run_until_end = true;
        this.stop_once_finished = false;
    }

    start_animation(){
        this.running = true;
    }
    stop_animation(){
        this.running = false;
    }

}



export function load_animators(node, type){

    switch (type) {
        case GameInstance_tool.type_enum.ENEMY_STANDARD:
            //death
            const death_fish = new Animator(node, "death_animation");
            const death_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,-0.5,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-90,0,0),
                    runtime : 1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,-3,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-90,0,0),
                    runtime : 4
                }),
            ];
            death_fish.add_keyframes(death_fish_keyframes);
            node.addComponent(death_fish);
            node.addComponent(death_fish.transform);
            //take damage
            const take_damage_fish = new Animator(node, "take_damage_animation");
            const take_damage_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,-0.4),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-10,0,0),
                    runtime : 0.1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.3
                }),
            ];
            take_damage_fish.add_keyframes(take_damage_fish_keyframes);
            node.addComponent(take_damage_fish);
            node.addComponent(take_damage_fish.transform);
            //running
            const running_fish = new Animator(node, "run_animation", {stop_once_finished : false, run_until_end : false});
            const running_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,10,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,-10,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),

            ];
            running_fish.add_keyframes(running_fish_keyframes);
            node.addComponent(running_fish);
            node.addComponent(running_fish.transform);
            running_fish.start_animation();
            //melee
            const melee_fish = new Animator(node, "melee_animation", {stop_once_finished : true, run_until_end : false});
            const melee_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,1),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(30,20,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.6
                }),
            ];
            melee_fish.add_keyframes(melee_fish_keyframes);
            node.addComponent(melee_fish);
            node.addComponent(melee_fish.transform);
            //ranged
            const ranged_fish = new Animator(node, "ranged_animation", {stop_once_finished : true, run_until_end : false});
            const ranged_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,0),
                    relative_scale : vec3.fromValues(2,1.5,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.1
                }),
            ];
            ranged_fish.add_keyframes(ranged_fish_keyframes);
            node.addComponent(ranged_fish);
            node.addComponent(ranged_fish.transform);
            //idle
            const idle_fish = new Animator(node, "idle_animation", {stop_once_finished : false, run_until_end : false});
            const idle_fish_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1.2,1.2,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 1.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 1.5
                }),
            ];
            idle_fish.add_keyframes(idle_fish_keyframes);
            node.addComponent(idle_fish);
            node.addComponent(idle_fish.transform);
            break;
        case GameInstance_tool.type_enum.ENEMY_TANK:
            //take damage
            const death_shark = new Animator(node, "death_animation");
            const death_shark_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(-50,30*2,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,720*2),
                    runtime : 5
                }),
            ];
            death_shark.add_keyframes(death_shark_keyframes);
            node.addComponent(death_shark);
            node.addComponent(death_shark.transform);
            //take damage
            const take_damage_shark = new Animator(node, "take_damage_animation");
            const take_damage_shark_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(-0.5,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,5),
                    runtime : 0.1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.3
                }),
            ];
            take_damage_shark.add_keyframes(take_damage_shark_keyframes);
            node.addComponent(take_damage_shark);
            node.addComponent(take_damage_shark.transform);
            //running
            const run_shark = new Animator(node, "run_animation");
            const run_shark_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(5,0,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,-0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-5,0,0),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),

            ];
            run_shark.add_keyframes(run_shark_keyframes);
            node.addComponent(run_shark);
            node.addComponent(run_shark.transform);
            run_shark.start_animation();
            //melee
            const melee_shark = new Animator(node, "melee_animation");
            const melee_shark_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,2),
                    relative_scale : vec3.fromValues(1.2,1,1),
                    relative_rot : vec3.fromValues(0,0,-20),
                    runtime : 0.5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),
            ];
            melee_shark.add_keyframes(melee_shark_keyframes);
            node.addComponent(melee_shark);
            node.addComponent(melee_shark.transform);
            break;
        case GameInstance_tool.type_enum.HARPOON_EMPTY:
            //reloading
            const reload = new Animator(node, "reload_animation", {stop_once_finished : true});
            const reload_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,-0.5,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,20),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.3
                }),
                
            ];
            reload.add_keyframes(reload_keyframes);
            node.addComponent(reload);
            node.addComponent(reload.transform);
            //shooting
            const shoot = new Animator(node, "shoot_animation", {stop_once_finished : true});
            const shoot_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(-1,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.05
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.2
                }),
                
            ];
            shoot.add_keyframes(shoot_keyframes);
            node.addComponent(shoot);
            node.addComponent(shoot.transform);
            //melee attack
            const melee = new Animator(node, "melee_animation", {stop_once_finished : true});
            const melee_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(1.5,0,-1),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,40,0),
                    runtime : 0.08
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.4
                }),
                
            ];
            melee.add_keyframes(melee_keyframes);
            node.addComponent(melee);
            node.addComponent(melee.transform);
            break;
        case GameInstance_tool.type_enum.PLAYER:
            const run = new Animator(node, "run_animation", {stop_once_finished : false, keep_pos_after_end : false});
            const run_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(5,0,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,-0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-5,0,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.3
                }),
                
            ];
            run.add_keyframes(run_keyframes);
            node.addComponent(run);
            node.addComponent(run.transform);
            //melee
            const player_melee = new Animator(node, "melee_animation", {stop_once_finished : true, keep_pos_after_end : false});
            const player_melee_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0.5,0,0.5),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(10,30,0),
                    runtime : 0.08
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.4
                }),
            ];
            player_melee.add_keyframes(player_melee_keyframes);
            node.addComponent(player_melee);
            node.addComponent(player_melee.transform);
            //melee
            const player_shoot = new Animator(node, "shoot_animation", {stop_once_finished : true, keep_pos_after_end : false});
            const player_shoot_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(-0.2,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,3),
                    runtime : 0.05
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.2
                }),
            ];
            player_shoot.add_keyframes(player_shoot_keyframes);
            node.addComponent(player_shoot);
            node.addComponent(player_shoot.transform);
            break;
        case GameInstance_tool.type_enum.ENEMY_FAST:
            //death
            const death_shrimp = new Animator(node, "death_animation");
            const death_shrimp_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-30,360,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,-6,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-30,720*4,0),
                    runtime : 4
                }),
            ];
            death_shrimp.add_keyframes(death_shrimp_keyframes);
            node.addComponent(death_shrimp);
            node.addComponent(death_shrimp.transform);
            //run
            const run_shrimp = new Animator(node, "run_animation");
            const run_shrimp_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(5,0,0),
                    runtime : 0.1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0.5,-0.2),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(-5,0,0),
                    runtime : 0.1
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.1
                }),
            ];
            run_shrimp.add_keyframes(run_shrimp_keyframes);
            node.addComponent(run_shrimp);
            node.addComponent(run_shrimp.transform);
            run_shrimp.start_animation();
            //melee
            const melee_shrimp = new Animator(node, "melee_animation");
            const melee_shrimp_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,2),
                    relative_scale : vec3.fromValues(1.2,1,1),
                    relative_rot : vec3.fromValues(0,360,0),
                    runtime : 0.3
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,0,0),
                    runtime : 0.5
                }),
            ];
            melee_shrimp.add_keyframes(melee_shrimp_keyframes);
            node.addComponent(melee_shrimp);
            node.addComponent(melee_shrimp.transform);
            break;
        case GameInstance_tool.type_enum.BOLT_PICKUP:
            const animate_foat = new Animator(node, "floating_animation");
            const animate_foat_keyframes = [
                new Keyframe({
                    relative_trans : vec3.fromValues(0,2,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,180,0),
                    runtime : 5
                }),
                new Keyframe({
                    relative_trans : vec3.fromValues(0,0,0),
                    relative_scale : vec3.fromValues(1,1,1),
                    relative_rot : vec3.fromValues(0,360,0),
                    runtime : 5
                }),
            ];
            animate_foat.add_keyframes(animate_foat_keyframes);
            node.addComponent(animate_foat);
            node.addComponent(animate_foat.transform);
            animate_foat.start_animation();
            break;
        default:
            break;
    }


}